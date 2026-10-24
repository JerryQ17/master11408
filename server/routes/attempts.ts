import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { sha256 } from '../auth/access';
import type {
  AttemptResult,
  RevealAttemptResponse,
  SelfEvaluationResponse,
  SubmitAttemptResponse,
} from '../../shared/types';

export const attemptsRoute = new Hono<AppEnv>();

// 辅助函数：根据所有 attempt 记录重算 user_question_state
export async function recomputeUserQuestionState(
  db: D1Database,
  userId: string,
  questionId: string,
) {
  const attemptsRes = await db
    .prepare(
      `
      SELECT id, state, result, submitted_at, evaluated_at
      FROM attempts
      WHERE user_id = ? AND question_id = ?
      ORDER BY submitted_at DESC, id DESC
    `,
    )
    .bind(userId, questionId)
    .all<{
      id: string;
      state: string;
      result: AttemptResult | null;
      submitted_at: number;
      evaluated_at: number | null;
    }>();

  const attempts = attemptsRes.results;
  const attemptCount = attempts.length;
  const lastAttempt = attempts[0] ?? null;

  const evaluatedAttempts = attempts.filter((a) => a.state === 'evaluated');
  const evaluatedCount = evaluatedAttempts.length;
  const correctCount = evaluatedAttempts.filter((a) => a.result === 'correct').length;
  const wrongCount = evaluatedAttempts.filter(
    (a) => a.result === 'incorrect' || a.result === 'partial',
  ).length;

  const latestEvaluated = evaluatedAttempts[0] ?? null;
  const lastResult = latestEvaluated ? latestEvaluated.result : null;

  const now = Date.now();
  await db
    .prepare(
      `
      INSERT INTO user_question_state (
        user_id, question_id, last_attempt_id, latest_evaluated_attempt_id,
        attempt_count, evaluated_count, correct_count, wrong_count,
        last_result, manual_review, starred, state_version, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)
      ON CONFLICT(user_id, question_id) DO UPDATE SET
        last_attempt_id = excluded.last_attempt_id,
        latest_evaluated_attempt_id = excluded.latest_evaluated_attempt_id,
        attempt_count = excluded.attempt_count,
        evaluated_count = excluded.evaluated_count,
        correct_count = excluded.correct_count,
        wrong_count = excluded.wrong_count,
        last_result = excluded.last_result,
        updated_at = excluded.updated_at
    `,
    )
    .bind(
      userId,
      questionId,
      lastAttempt ? lastAttempt.id : null,
      latestEvaluated ? latestEvaluated.id : null,
      attemptCount,
      evaluatedCount,
      correctCount,
      wrongCount,
      lastResult,
      now,
    )
    .run();
}

// 辅助函数：检查题组是否全部条目已完成
async function checkSessionCompletion(db: D1Database, sessionId: string, userId: string) {
  const check = await db
    .prepare(
      `
      SELECT
        (SELECT count(*) FROM practice_session_items WHERE session_id = ?) as total_items,
        (SELECT count(*) FROM attempts WHERE session_id = ? AND user_id = ? AND state = 'evaluated') as evaluated_items
    `,
    )
    .bind(sessionId, sessionId, userId)
    .first<{ total_items: number; evaluated_items: number }>();

  if (check && check.total_items > 0 && check.total_items === check.evaluated_items) {
    await db
      .prepare('UPDATE practice_sessions SET completed_at = ?, updated_at = ? WHERE id = ?')
      .bind(Date.now(), Date.now(), sessionId)
      .run();
  } else {
    await db
      .prepare('UPDATE practice_sessions SET updated_at = ? WHERE id = ?')
      .bind(Date.now(), sessionId)
      .run();
  }
}

// 1. 客观题提交
const submitSchema = z.object({
  practiceSessionId: z.string().min(1),
  ordinal: z.number().int().min(1),
  revision: z.number().int().min(1),
  selectedKeys: z.array(z.string()).min(1),
  idempotencyKey: z.string().min(1).max(128),
});

attemptsRoute.post('/submit', async (c) => {
  const user = c.var.user;
  const db = c.env.DB;
  const body = submitSchema.parse(await c.req.json());

  const requestHash = await sha256(
    JSON.stringify({
      endpoint: 'submit',
      practiceSessionId: body.practiceSessionId,
      ordinal: body.ordinal,
      revision: body.revision,
      selectedKeys: [...body.selectedKeys].sort(),
    }),
  );

  // 幂等性检查
  const existingByKey = await db
    .prepare(
      'SELECT id, session_id, ordinal, request_hash, result FROM attempts WHERE user_id = ? AND idempotency_key = ?',
    )
    .bind(user.id, body.idempotencyKey)
    .first<{
      id: string;
      session_id: string;
      ordinal: number;
      request_hash: string;
      result: AttemptResult;
    }>();

  if (existingByKey) {
    if (existingByKey.request_hash !== requestHash) {
      return c.json(
        { error: { code: 'IDEMPOTENCY_CONFLICT', message: '幂等键冲突：已用于不同的提交请求' } },
        409,
      );
    }
    // 回放该次提交的结果与解析
    const rev = await db
      .prepare(
        `
        SELECT qr.answer_json, qr.explanation_md
        FROM practice_session_items psi
        JOIN question_revisions qr ON qr.question_id = psi.question_id AND qr.revision = psi.revision
        WHERE psi.session_id = ? AND psi.ordinal = ?
      `,
      )
      .bind(existingByKey.session_id, existingByKey.ordinal)
      .first<{ answer_json: string; explanation_md: string }>();

    return c.json<SubmitAttemptResponse>({
      attemptId: existingByKey.id,
      result: existingByKey.result as 'correct' | 'incorrect',
      correctAnswer: JSON.parse(rev?.answer_json ?? '""'),
      explanationMd: rev?.explanation_md ?? '',
    });
  }

  // 检查该题组该题号是否已答过
  const existingItemAttempt = await db
    .prepare('SELECT id FROM attempts WHERE session_id = ? AND ordinal = ?')
    .bind(body.practiceSessionId, body.ordinal)
    .first();
  if (existingItemAttempt) {
    return c.json(
      { error: { code: 'ITEM_ALREADY_ATTEMPTED', message: '本题已经提交过作答' } },
      409,
    );
  }

  // 读取题组条目与题目版本快照
  const item = await db
    .prepare(
      `
      SELECT psi.question_id, psi.revision, qr.type, qr.answer_json, qr.explanation_md
      FROM practice_session_items psi
      JOIN practice_sessions ps ON ps.id = psi.session_id
      JOIN question_revisions qr ON qr.question_id = psi.question_id AND qr.revision = psi.revision
      WHERE psi.session_id = ? AND psi.ordinal = ? AND ps.user_id = ?
    `,
    )
    .bind(body.practiceSessionId, body.ordinal, user.id)
    .first<{
      question_id: string;
      revision: number;
      type: string;
      answer_json: string;
      explanation_md: string;
    }>();

  if (!item) {
    return c.json({ error: { code: 'NOT_FOUND', message: '题目条目不存在' } }, 404);
  }

  if (item.revision !== body.revision) {
    return c.json({ error: { code: 'REVISION_MISMATCH', message: '题目版本不一致' } }, 400);
  }

  if (item.type !== 'single_choice' && item.type !== 'multiple_choice') {
    return c.json(
      { error: { code: 'INVALID_QUESTION_TYPE', message: '主观题请通过揭示-自评流程提交' } },
      400,
    );
  }

  // 判分
  const correctAnswer = JSON.parse(item.answer_json);
  let isCorrect = false;

  if (item.type === 'single_choice') {
    if (body.selectedKeys.length !== 1) {
      return c.json({ error: { code: 'INVALID_ANSWER', message: '单选题必须恰好选择一项' } }, 422);
    }
    isCorrect = body.selectedKeys[0] === correctAnswer;
  } else if (item.type === 'multiple_choice') {
    const selectedSorted = [...new Set(body.selectedKeys)].sort();
    const correctSorted = Array.isArray(correctAnswer) ? [...correctAnswer].sort() : [];
    isCorrect = JSON.stringify(selectedSorted) === JSON.stringify(correctSorted);
  }

  const result: AttemptResult = isCorrect ? 'correct' : 'incorrect';
  const attemptId = crypto.randomUUID();
  const now = Date.now();

  await db.batch([
    db
      .prepare(
        `
      INSERT INTO attempts (
        id, user_id, question_id, revision, session_id, ordinal,
        selected_answer_json, response_text, state, result,
        submitted_at, evaluated_at, evaluation_version, idempotency_key, request_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'evaluated', ?, ?, ?, 0, ?, ?)
    `,
      )
      .bind(
        attemptId,
        user.id,
        item.question_id,
        item.revision,
        body.practiceSessionId,
        body.ordinal,
        JSON.stringify(body.selectedKeys),
        result,
        now,
        now,
        body.idempotencyKey,
        requestHash,
      ),
  ]);

  await recomputeUserQuestionState(db, user.id, item.question_id);
  await checkSessionCompletion(db, body.practiceSessionId, user.id);

  return c.json<SubmitAttemptResponse>({
    attemptId,
    result: isCorrect ? 'correct' : 'incorrect',
    correctAnswer,
    explanationMd: item.explanation_md,
  });
});

// 2. 主观题查看解析 (Reveal)
const revealSchema = z.object({
  practiceSessionId: z.string().min(1),
  ordinal: z.number().int().min(1),
  revision: z.number().int().min(1),
  responseText: z.string().max(20000).optional(),
  idempotencyKey: z.string().min(1).max(128),
});

attemptsRoute.post('/reveal', async (c) => {
  const user = c.var.user;
  const db = c.env.DB;
  const body = revealSchema.parse(await c.req.json());

  const requestHash = await sha256(
    JSON.stringify({
      endpoint: 'reveal',
      practiceSessionId: body.practiceSessionId,
      ordinal: body.ordinal,
      revision: body.revision,
      responseText: body.responseText ?? '',
    }),
  );

  // 幂等性检查
  const existingByKey = await db
    .prepare(
      'SELECT id, session_id, ordinal, request_hash, evaluation_version FROM attempts WHERE user_id = ? AND idempotency_key = ?',
    )
    .bind(user.id, body.idempotencyKey)
    .first<{
      id: string;
      session_id: string;
      ordinal: number;
      request_hash: string;
      evaluation_version: number;
    }>();

  if (existingByKey) {
    if (existingByKey.request_hash !== requestHash) {
      return c.json({ error: { code: 'IDEMPOTENCY_CONFLICT', message: '幂等键冲突' } }, 409);
    }
    const rev = await db
      .prepare(
        `
        SELECT qr.answer_json, qr.explanation_md
        FROM practice_session_items psi
        JOIN question_revisions qr ON qr.question_id = psi.question_id AND qr.revision = psi.revision
        WHERE psi.session_id = ? AND psi.ordinal = ?
      `,
      )
      .bind(existingByKey.session_id, existingByKey.ordinal)
      .first<{ answer_json: string; explanation_md: string }>();

    return c.json<RevealAttemptResponse>({
      attemptId: existingByKey.id,
      state: 'revealed_pending_self_eval',
      correctAnswer: JSON.parse(rev?.answer_json ?? '""'),
      explanationMd: rev?.explanation_md ?? '',
      evaluationVersion: existingByKey.evaluation_version,
    });
  }

  // 检查该条目是否已有 attempt
  const existingItemAttempt = await db
    .prepare('SELECT id FROM attempts WHERE session_id = ? AND ordinal = ?')
    .bind(body.practiceSessionId, body.ordinal)
    .first();
  if (existingItemAttempt) {
    return c.json(
      { error: { code: 'ITEM_ALREADY_ATTEMPTED', message: '本题已经揭示或提交过' } },
      409,
    );
  }

  const item = await db
    .prepare(
      `
      SELECT psi.question_id, psi.revision, qr.type, qr.answer_json, qr.explanation_md
      FROM practice_session_items psi
      JOIN practice_sessions ps ON ps.id = psi.session_id
      JOIN question_revisions qr ON qr.question_id = psi.question_id AND qr.revision = psi.revision
      WHERE psi.session_id = ? AND psi.ordinal = ? AND ps.user_id = ?
    `,
    )
    .bind(body.practiceSessionId, body.ordinal, user.id)
    .first<{
      question_id: string;
      revision: number;
      type: string;
      answer_json: string;
      explanation_md: string;
    }>();

  if (!item) {
    return c.json({ error: { code: 'NOT_FOUND', message: '题目条目不存在' } }, 404);
  }

  if (item.type !== 'fill_blank' && item.type !== 'written') {
    return c.json(
      { error: { code: 'INVALID_QUESTION_TYPE', message: '客观题请通过直接提交接口判分' } },
      400,
    );
  }

  const attemptId = crypto.randomUUID();
  const now = Date.now();

  await db.batch([
    db
      .prepare(
        `
      INSERT INTO attempts (
        id, user_id, question_id, revision, session_id, ordinal,
        selected_answer_json, response_text, state, result,
        submitted_at, evaluated_at, evaluation_version, idempotency_key, request_hash
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'revealed_pending_self_eval', NULL, ?, NULL, 0, ?, ?)
    `,
      )
      .bind(
        attemptId,
        user.id,
        item.question_id,
        item.revision,
        body.practiceSessionId,
        body.ordinal,
        body.responseText ?? null,
        now,
        body.idempotencyKey,
        requestHash,
      ),
  ]);

  await recomputeUserQuestionState(db, user.id, item.question_id);

  return c.json<RevealAttemptResponse>({
    attemptId,
    state: 'revealed_pending_self_eval',
    correctAnswer: JSON.parse(item.answer_json),
    explanationMd: item.explanation_md,
    evaluationVersion: 0,
  });
});

// 3. 主观题自评 / 更正自评
const selfEvalSchema = z.object({
  result: z.enum(['correct', 'partial', 'incorrect']),
  expectedVersion: z.number().int().min(0),
});

attemptsRoute.patch('/:id/self-evaluation', async (c) => {
  const id = c.req.param('id');
  const user = c.var.user;
  const db = c.env.DB;
  const body = selfEvalSchema.parse(await c.req.json());

  const currentAttempt = await db
    .prepare(
      'SELECT id, user_id, question_id, session_id, state, result, evaluation_version FROM attempts WHERE id = ? AND user_id = ?',
    )
    .bind(id, user.id)
    .first<{
      id: string;
      user_id: string;
      question_id: string;
      session_id: string;
      state: string;
      result: AttemptResult | null;
      evaluation_version: number;
    }>();

  if (!currentAttempt) {
    return c.json({ error: { code: 'NOT_FOUND', message: '作答记录不存在' } }, 404);
  }

  // 重复提交相同评价无缝幂等
  if (
    currentAttempt.evaluation_version === body.expectedVersion + 1 &&
    currentAttempt.result === body.result
  ) {
    return c.json<SelfEvaluationResponse>({
      attemptId: id,
      result: body.result,
      evaluationVersion: currentAttempt.evaluation_version,
    });
  }

  const now = Date.now();
  const nextVersion = currentAttempt.evaluation_version + 1;

  // 严格条件更新
  const updateResult = await db
    .prepare(
      `
      UPDATE attempts
      SET state = 'evaluated', result = ?, evaluated_at = ?, evaluation_version = ?
      WHERE id = ? AND user_id = ? AND evaluation_version = ?
    `,
    )
    .bind(body.result, now, nextVersion, id, user.id, body.expectedVersion)
    .run();

  if (updateResult.meta.changes === 0) {
    return c.json(
      { error: { code: 'VERSION_CONFLICT', message: '评价版本冲突，请重新读取' } },
      409,
    );
  }

  // 记录评价事件日志
  await db
    .prepare(
      `
      INSERT INTO attempt_evaluation_events (attempt_id, evaluation_version, previous_result, new_result, changed_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    )
    .bind(id, nextVersion, currentAttempt.result, body.result, now)
    .run();

  await recomputeUserQuestionState(db, user.id, currentAttempt.question_id);
  await checkSessionCompletion(db, currentAttempt.session_id, user.id);

  return c.json<SelfEvaluationResponse>({
    attemptId: id,
    result: body.result,
    evaluationVersion: nextVersion,
  });
});

// 4. 获取本人指定题目的历史尝试
attemptsRoute.get('/', async (c) => {
  const questionId = c.req.query('questionId');
  const user = c.var.user;
  const db = c.env.DB;

  if (!questionId) {
    return c.json({ error: { code: 'INVALID_INPUT', message: '需要提供 questionId' } }, 422);
  }

  const list = await db
    .prepare(
      `
      SELECT id, revision, session_id, ordinal, state, result, submitted_at, evaluated_at, evaluation_version
      FROM attempts
      WHERE user_id = ? AND question_id = ?
      ORDER BY submitted_at DESC, id DESC
    `,
    )
    .bind(user.id, questionId)
    .all();

  return c.json(list.results);
});
