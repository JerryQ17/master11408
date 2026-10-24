import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import type { AttemptResult, QuestionType, WrongBookItemDto } from '../../shared/types';

export const wrongBookRoute = new Hono<AppEnv>();

wrongBookRoute.get('/wrong-book', async (c) => {
  const user = c.var.user;
  const db = c.env.DB;
  const mode = c.req.query('mode') ?? 'review';
  const topicId = c.req.query('topicId');

  let modeCondition: string;
  if (mode === 'ever') {
    modeCondition = 'uqs.wrong_count > 0';
  } else if (mode === 'latest') {
    modeCondition = "uqs.last_result IN ('partial', 'incorrect')";
  } else if (mode === 'review') {
    modeCondition = "(uqs.manual_review = 1 OR uqs.last_result IN ('partial', 'incorrect'))";
  } else {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'mode 参数必须为 ever、latest 或 review' } },
      422,
    );
  }

  let sql = `
    SELECT
      q.id as question_id,
      q.current_revision as revision,
      q.type,
      q.difficulty,
      qr.stem_md,
      uqs.last_result,
      uqs.wrong_count,
      uqs.attempt_count,
      uqs.manual_review,
      uqs.starred
    FROM user_question_state uqs
    JOIN questions q ON q.id = uqs.question_id
    JOIN question_revisions qr ON qr.question_id = q.id AND qr.revision = q.current_revision
  `;

  const joins: string[] = [];
  const where: string[] = ['uqs.user_id = ?', modeCondition];
  const params: unknown[] = [user.id];

  if (topicId) {
    joins.push(`
      JOIN question_topics qt ON qt.question_id = q.id
      JOIN (
        WITH RECURSIVE subtopics AS (
          SELECT id FROM topics WHERE id = ?
          UNION ALL
          SELECT t.id FROM topics t JOIN subtopics s ON t.parent_id = s.id WHERE t.active = 1
        ) SELECT id FROM subtopics
      ) st ON st.id = qt.topic_id
    `);
    params.push(topicId);
  }

  sql += joins.join(' ');
  sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY uqs.updated_at DESC';

  const rows = await db
    .prepare(sql)
    .bind(...params)
    .all<{
      question_id: string;
      revision: number;
      type: QuestionType;
      difficulty: number;
      stem_md: string;
      last_result: AttemptResult | null;
      wrong_count: number;
      attempt_count: number;
      manual_review: number;
      starred: number;
    }>();

  const questionIds = rows.results.map((r) => r.question_id);
  const topicsMap = new Map<string, { id: string; title: string }[]>();

  if (questionIds.length > 0) {
    const placeholders = questionIds.map(() => '?').join(',');
    const qTopics = await db
      .prepare(
        `
        SELECT qt.question_id, t.id, t.title
        FROM question_topics qt
        JOIN topics t ON t.id = qt.topic_id
        WHERE qt.question_id IN (${placeholders})
      `,
      )
      .bind(...questionIds)
      .all<{ question_id: string; id: string; title: string }>();

    for (const row of qTopics.results) {
      if (!topicsMap.has(row.question_id)) topicsMap.set(row.question_id, []);
      topicsMap.get(row.question_id)!.push({ id: row.id, title: row.title });
    }
  }

  const list: WrongBookItemDto[] = rows.results.map((r) => ({
    questionId: r.question_id,
    revision: r.revision,
    type: r.type,
    stemMd: r.stem_md,
    difficulty: r.difficulty,
    lastResult: r.last_result,
    wrongCount: r.wrong_count,
    attemptCount: r.attempt_count,
    manualReview: Boolean(r.manual_review),
    starred: Boolean(r.starred),
    topics: topicsMap.get(r.question_id) ?? [],
  }));

  return c.json(list);
});

const patchStateSchema = z.object({
  manualReview: z.boolean().optional(),
  starred: z.boolean().optional(),
  stateVersion: z.number().int().min(0).optional(),
});

wrongBookRoute.patch('/question-state/:questionId', async (c) => {
  const questionId = c.req.param('questionId');
  const user = c.var.user;
  const db = c.env.DB;
  const body = patchStateSchema.parse(await c.req.json());

  const existing = await db
    .prepare(
      'SELECT manual_review, starred, state_version FROM user_question_state WHERE user_id = ? AND question_id = ?',
    )
    .bind(user.id, questionId)
    .first<{ manual_review: number; starred: number; state_version: number }>();

  const now = Date.now();
  const nextManualReview =
    body.manualReview !== undefined ? (body.manualReview ? 1 : 0) : (existing?.manual_review ?? 0);
  const nextStarred =
    body.starred !== undefined ? (body.starred ? 1 : 0) : (existing?.starred ?? 0);

  if (!existing) {
    await db
      .prepare(
        `
        INSERT INTO user_question_state (
          user_id, question_id, manual_review, starred, state_version, updated_at
        ) VALUES (?, ?, ?, ?, 1, ?)
      `,
      )
      .bind(user.id, questionId, nextManualReview, nextStarred, now)
      .run();
    return c.json({
      manualReview: Boolean(nextManualReview),
      starred: Boolean(nextStarred),
      stateVersion: 1,
    });
  }

  const nextVersion = existing.state_version + 1;
  const updateRes = await db
    .prepare(
      `
      UPDATE user_question_state
      SET manual_review = ?, starred = ?, state_version = ?, updated_at = ?
      WHERE user_id = ? AND question_id = ?
    `,
    )
    .bind(nextManualReview, nextStarred, nextVersion, now, user.id, questionId)
    .run();

  if (updateRes.meta.changes === 0) {
    return c.json({ error: { code: 'STATE_CONFLICT', message: '状态版本冲突' } }, 409);
  }

  return c.json({
    manualReview: Boolean(nextManualReview),
    starred: Boolean(nextStarred),
    stateVersion: nextVersion,
  });
});
