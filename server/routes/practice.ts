import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import type {
  CreatePracticeSessionResponse,
  PracticeSessionDetailDto,
  PracticeSessionSummaryDto,
  SessionItemViewDto,
  QuestionDetailDto,
  AttemptState,
  AttemptResult,
} from '../../shared/types';
import { sha256 } from '../auth/access';

export const practiceRoute = new Hono<AppEnv>();

const createSessionSchema = z.object({
  questionIds: z.array(z.string()).optional(),
  topicIds: z.array(z.string()).optional(),
  tagIds: z.array(z.string()).optional(),
  difficulties: z.array(z.number().int().min(1).max(5)).optional(),
  types: z.array(z.enum(['single_choice', 'multiple_choice', 'fill_blank', 'written'])).optional(),
  examYears: z.array(z.number().int()).optional(),
  statusFilter: z
    .enum(['all', 'unattempted', 'ever_wrong', 'latest_wrong', 'review', 'starred'])
    .default('all'),
  count: z.number().int().min(1).max(100).default(10),
  mode: z.enum(['ordered', 'random']).default('ordered'),
  creationKey: z.string().min(1).max(128),
});

practiceRoute.post('/practice-sessions', async (c) => {
  const user = c.var.user;
  const db = c.env.DB;
  const body = createSessionSchema.parse(await c.req.json());

  const requestHash = await sha256(JSON.stringify({ ...body, userId: user.id }));

  // 1. 检查幂等性
  const existingSession = await db
    .prepare(
      'SELECT id, (SELECT count(*) FROM practice_session_items WHERE session_id = ps.id) as count FROM practice_sessions ps WHERE user_id = ? AND creation_key = ?',
    )
    .bind(user.id, body.creationKey)
    .first<{ id: string; count: number }>();

  if (existingSession) {
    return c.json<CreatePracticeSessionResponse>({
      sessionId: existingSession.id,
      count: existingSession.count,
    });
  }

  // 2. 筛选题目
  let sql = 'SELECT DISTINCT q.id, q.current_revision, q.difficulty FROM questions q';
  const joins: string[] = [];
  const where: string[] = ['q.active = 1'];
  const params: unknown[] = [];

  if (body.questionIds && body.questionIds.length > 0) {
    const qPlaceholders = body.questionIds.map(() => '?').join(',');
    where.push(`q.id IN (${qPlaceholders})`);
    params.push(...body.questionIds);
  }

  if (body.topicIds && body.topicIds.length > 0) {
    const tPlaceholders = body.topicIds.map(() => '?').join(',');
    joins.push(`
      JOIN question_topics qt ON qt.question_id = q.id
      JOIN (
        WITH RECURSIVE subtopics AS (
          SELECT id FROM topics WHERE id IN (${tPlaceholders})
          UNION ALL
          SELECT t.id FROM topics t JOIN subtopics s ON t.parent_id = s.id WHERE t.active = 1
        ) SELECT id FROM subtopics
      ) st ON st.id = qt.topic_id
    `);
    params.push(...body.topicIds);
  }

  if (body.tagIds && body.tagIds.length > 0) {
    const tgPlaceholders = body.tagIds.map(() => '?').join(',');
    joins.push(`
      JOIN question_tags qtg ON qtg.question_id = q.id
      JOIN (
        WITH RECURSIVE subtags AS (
          SELECT id FROM tags WHERE id IN (${tgPlaceholders})
          UNION ALL
          SELECT tg.id FROM tags tg JOIN subtags stg ON tg.parent_id = stg.id WHERE tg.active = 1
        ) SELECT id FROM subtags
      ) stg ON stg.id = qtg.tag_id
    `);
    params.push(...body.tagIds);
  }

  if (body.difficulties && body.difficulties.length > 0) {
    const dPlaceholders = body.difficulties.map(() => '?').join(',');
    where.push(`q.difficulty IN (${dPlaceholders})`);
    params.push(...body.difficulties);
  }

  if (body.types && body.types.length > 0) {
    const typePlaceholders = body.types.map(() => '?').join(',');
    where.push(`q.type IN (${typePlaceholders})`);
    params.push(...body.types);
  }

  if (body.examYears && body.examYears.length > 0) {
    const yPlaceholders = body.examYears.map(() => '?').join(',');
    where.push(`q.exam_year IN (${yPlaceholders})`);
    params.push(...body.examYears);
  }

  if (body.statusFilter === 'unattempted') {
    where.push(
      'NOT EXISTS (SELECT 1 FROM attempts a WHERE a.user_id = ? AND a.question_id = q.id)',
    );
    params.push(user.id);
  } else if (body.statusFilter === 'ever_wrong') {
    where.push(
      'EXISTS (SELECT 1 FROM user_question_state uqs WHERE uqs.user_id = ? AND uqs.question_id = q.id AND uqs.wrong_count > 0)',
    );
    params.push(user.id);
  } else if (body.statusFilter === 'latest_wrong') {
    where.push(
      "EXISTS (SELECT 1 FROM user_question_state uqs WHERE uqs.user_id = ? AND uqs.question_id = q.id AND uqs.last_result IN ('partial', 'incorrect'))",
    );
    params.push(user.id);
  } else if (body.statusFilter === 'review') {
    where.push(
      "EXISTS (SELECT 1 FROM user_question_state uqs WHERE uqs.user_id = ? AND uqs.question_id = q.id AND (uqs.manual_review = 1 OR uqs.last_result IN ('partial', 'incorrect')))",
    );
    params.push(user.id);
  } else if (body.statusFilter === 'starred') {
    where.push(
      'EXISTS (SELECT 1 FROM user_question_state uqs WHERE uqs.user_id = ? AND uqs.question_id = q.id AND uqs.starred = 1)',
    );
    params.push(user.id);
  }

  sql += joins.join(' ');
  sql += ' WHERE ' + where.join(' AND ');

  if (body.mode === 'random') {
    sql += ' ORDER BY RANDOM() LIMIT ?';
  } else {
    sql += ' ORDER BY q.id ASC LIMIT ?';
  }
  params.push(body.count);

  const matched = await db
    .prepare(sql)
    .bind(...params)
    .all<{
      id: string;
      current_revision: number;
      difficulty: number;
    }>();

  if (matched.results.length === 0) {
    return c.json<CreatePracticeSessionResponse>({ sessionId: null, count: 0 });
  }

  // 3. 插入题组与条目
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const batch = [
    db
      .prepare(
        `
      INSERT INTO practice_sessions (id, user_id, filter_json, creation_key, request_hash, current_ordinal, progress_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)
    `,
      )
      .bind(sessionId, user.id, JSON.stringify(body), body.creationKey, requestHash, now, now),
  ];

  for (let i = 0; i < matched.results.length; i++) {
    const q = matched.results[i]!;
    batch.push(
      db
        .prepare(
          `
        INSERT INTO practice_session_items (session_id, ordinal, question_id, revision)
        VALUES (?, ?, ?, ?)
      `,
        )
        .bind(sessionId, i + 1, q.id, q.current_revision),
    );
  }

  await db.batch(batch);

  return c.json<CreatePracticeSessionResponse>({
    sessionId,
    count: matched.results.length,
  });
});

practiceRoute.get('/practice-sessions', async (c) => {
  const user = c.var.user;
  const db = c.env.DB;
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 50);

  const sessionsRes = await db
    .prepare(
      `
      SELECT ps.id, ps.created_at, ps.updated_at, ps.completed_at, ps.current_ordinal,
             count(psi.ordinal) as item_count,
             count(case when a.state = 'evaluated' then 1 end) as evaluated_count,
             count(case when a.state = 'revealed_pending_self_eval' then 1 end) as pending_count
      FROM practice_sessions ps
      JOIN practice_session_items psi ON psi.session_id = ps.id
      LEFT JOIN attempts a ON a.session_id = ps.id AND a.ordinal = psi.ordinal AND a.user_id = ps.user_id
      WHERE ps.user_id = ?
      GROUP BY ps.id
      ORDER BY ps.updated_at DESC
      LIMIT ?
    `,
    )
    .bind(user.id, limit)
    .all<{
      id: string;
      created_at: number;
      updated_at: number;
      completed_at: number | null;
      current_ordinal: number;
      item_count: number;
      evaluated_count: number;
      pending_count: number;
    }>();

  const list: PracticeSessionSummaryDto[] = sessionsRes.results.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
    currentOrdinal: r.current_ordinal,
    itemCount: r.item_count,
    evaluatedCount: r.evaluated_count,
    pendingCount: r.pending_count,
  }));

  return c.json(list);
});

practiceRoute.get('/practice-sessions/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.var.user;
  const db = c.env.DB;

  const session = await db
    .prepare(
      'SELECT id, current_ordinal, progress_version, completed_at FROM practice_sessions WHERE id = ? AND user_id = ?',
    )
    .bind(id, user.id)
    .first<{
      id: string;
      current_ordinal: number;
      progress_version: number;
      completed_at: number | null;
    }>();

  if (!session) {
    return c.json({ error: { code: 'NOT_FOUND', message: '练习会话不存在' } }, 404);
  }

  const itemsRes = await db
    .prepare(
      `
      SELECT psi.ordinal, psi.question_id, psi.revision, a.state as attempt_state, a.result as attempt_result
      FROM practice_session_items psi
      LEFT JOIN attempts a ON a.session_id = psi.session_id AND a.ordinal = psi.ordinal AND a.user_id = ?
      WHERE psi.session_id = ?
      ORDER BY psi.ordinal ASC
    `,
    )
    .bind(user.id, id)
    .all<{
      ordinal: number;
      question_id: string;
      revision: number;
      attempt_state: AttemptState | null;
      attempt_result: AttemptResult | null;
    }>();

  const dto: PracticeSessionDetailDto = {
    id: session.id,
    currentOrdinal: session.current_ordinal,
    progressVersion: session.progress_version,
    itemCount: itemsRes.results.length,
    completed: session.completed_at !== null,
    items: itemsRes.results.map((r) => ({
      ordinal: r.ordinal,
      questionId: r.question_id,
      revision: r.revision,
      attemptState: r.attempt_state ?? 'none',
      attemptResult: r.attempt_result ?? null,
    })),
  };

  return c.json(dto);
});

practiceRoute.patch('/practice-sessions/:id/progress', async (c) => {
  const id = c.req.param('id');
  const user = c.var.user;
  const db = c.env.DB;

  const body = z
    .object({
      ordinal: z.number().int().min(1),
      expectedVersion: z.number().int(),
    })
    .parse(await c.req.json());

  const result = await db
    .prepare(
      `
      UPDATE practice_sessions
      SET current_ordinal = ?, progress_version = progress_version + 1, updated_at = ?
      WHERE id = ? AND user_id = ? AND progress_version = ?
      RETURNING progress_version
    `,
    )
    .bind(body.ordinal, Date.now(), id, user.id, body.expectedVersion)
    .first<{ progress_version: number }>();

  if (!result) {
    return c.json(
      { error: { code: 'PROGRESS_CONFLICT', message: '进度版本冲突，请重新读取' } },
      409,
    );
  }

  return c.json({ progressVersion: result.progress_version });
});

practiceRoute.get('/practice-sessions/:id/items/:ordinal', async (c) => {
  const id = c.req.param('id');
  const ordinal = Number(c.req.param('ordinal'));
  const user = c.var.user;
  const db = c.env.DB;

  const session = await db
    .prepare('SELECT id FROM practice_sessions WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .first();
  if (!session) {
    return c.json({ error: { code: 'NOT_FOUND', message: '练习会话不存在' } }, 404);
  }

  const totalCount = await db
    .prepare('SELECT count(*) as count FROM practice_session_items WHERE session_id = ?')
    .bind(id)
    .first<{ count: number }>();

  const item = await db
    .prepare(
      `
      SELECT psi.ordinal, psi.question_id, psi.revision, qr.type, qr.stem_md, qr.options_json, qr.answer_json, qr.explanation_md, q.difficulty
      FROM practice_session_items psi
      JOIN question_revisions qr ON qr.question_id = psi.question_id AND qr.revision = psi.revision
      JOIN questions q ON q.id = psi.question_id
      WHERE psi.session_id = ? AND psi.ordinal = ?
    `,
    )
    .bind(id, ordinal)
    .first<{
      ordinal: number;
      question_id: string;
      revision: number;
      type: QuestionDetailDto['type'];
      stem_md: string;
      options_json: string | null;
      answer_json: string;
      explanation_md: string;
      difficulty: number;
    }>();

  if (!item) {
    return c.json({ error: { code: 'NOT_FOUND', message: '该题号不存在' } }, 404);
  }

  // 读取用户对该条目的作答记录（如果有）
  const attempt = await db
    .prepare(
      `
      SELECT id, state, result, evaluation_version AS evaluationVersion, selected_answer_json, response_text
      FROM attempts
      WHERE session_id = ? AND ordinal = ? AND user_id = ?
    `,
    )
    .bind(id, ordinal, user.id)
    .first<{
      id: string;
      state: AttemptState;
      result: AttemptResult | null;
      evaluationVersion: number;
      selected_answer_json: string | null;
      response_text: string | null;
    }>();

  // 读取用户全局标记状态
  const userState = await db
    .prepare(
      'SELECT manual_review, starred, last_result FROM user_question_state WHERE user_id = ? AND question_id = ?',
    )
    .bind(user.id, item.question_id)
    .first<{ manual_review: number; starred: number; last_result: string | null }>();

  const questionDto: QuestionDetailDto = {
    id: item.question_id,
    revision: item.revision,
    type: item.type,
    difficulty: item.difficulty,
    stemMd: item.stem_md,
    options: item.options_json ? JSON.parse(item.options_json) : null,
    userState: userState
      ? {
          manualReview: Boolean(userState.manual_review),
          starred: Boolean(userState.starred),
          lastResult: userState.last_result as AttemptResult | null,
        }
      : null,
  };

  const dto: SessionItemViewDto = {
    ordinal: item.ordinal,
    totalCount: totalCount?.count ?? 0,
    sessionId: id,
    question: questionDto,
    attempt: attempt
      ? {
          id: attempt.id,
          state: attempt.state,
          result: attempt.result,
          evaluationVersion: attempt.evaluationVersion,
          selectedAnswerJson: attempt.selected_answer_json,
          responseText: attempt.response_text,
        }
      : null,
    // 关键安全规则：只有当用户已提交或揭示时，才提供解答和解析！
    solution: attempt
      ? {
          correctAnswer: JSON.parse(item.answer_json),
          explanationMd: item.explanation_md,
        }
      : null,
  };

  return c.json(dto);
});
