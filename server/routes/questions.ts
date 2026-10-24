import { Hono } from 'hono';
import type { AppEnv } from '../context';
import type {
  AttemptResult,
  QuestionDetailDto,
  QuestionSummaryDto,
  QuestionType,
  SourceKind,
} from '../../shared/types';

export const questionsRoute = new Hono<AppEnv>();

questionsRoute.get('/', async (c) => {
  const db = c.env.DB;
  const topicId = c.req.query('topicId');
  const tagId = c.req.query('tagId');
  const type = c.req.query('type');
  const difficulty = c.req.query('difficulty');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100);

  let sql = `
    SELECT DISTINCT q.id, q.type, q.difficulty, q.current_revision, q.source_kind, q.exam_year
    FROM questions q
  `;
  const joins: string[] = [];
  const where: string[] = ['q.active = 1'];
  const params: unknown[] = [];

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

  if (tagId) {
    joins.push(`
      JOIN question_tags qtg ON qtg.question_id = q.id
      JOIN (
        WITH RECURSIVE subtags AS (
          SELECT id FROM tags WHERE id = ?
          UNION ALL
          SELECT tg.id FROM tags tg JOIN subtags stg ON tg.parent_id = stg.id WHERE tg.active = 1
        ) SELECT id FROM subtags
      ) stg ON stg.id = qtg.tag_id
    `);
    params.push(tagId);
  }

  if (type) {
    where.push('q.type = ?');
    params.push(type);
  }

  if (difficulty) {
    where.push('q.difficulty = ?');
    params.push(Number(difficulty));
  }

  sql += joins.join(' ');
  sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY q.id ASC LIMIT ?';
  params.push(limit);

  const res = await db
    .prepare(sql)
    .bind(...params)
    .all<{
      id: string;
      type: QuestionType;
      difficulty: number;
      current_revision: number;
      source_kind: SourceKind;
      exam_year: number | null;
    }>();

  const questionIds = res.results.map((r) => r.id);
  const topicsByQ = new Map<string, string[]>();
  const tagsByQ = new Map<string, string[]>();

  if (questionIds.length > 0) {
    const qPlaceholders = questionIds.map(() => '?').join(',');
    const qTopicsRes = await db
      .prepare(
        `SELECT question_id, topic_id FROM question_topics WHERE question_id IN (${qPlaceholders})`,
      )
      .bind(...questionIds)
      .all<{ question_id: string; topic_id: string }>();
    for (const row of qTopicsRes.results) {
      if (!topicsByQ.has(row.question_id)) topicsByQ.set(row.question_id, []);
      topicsByQ.get(row.question_id)!.push(row.topic_id);
    }

    const qTagsRes = await db
      .prepare(
        `SELECT question_id, tag_id FROM question_tags WHERE question_id IN (${qPlaceholders})`,
      )
      .bind(...questionIds)
      .all<{ question_id: string; tag_id: string }>();
    for (const row of qTagsRes.results) {
      if (!tagsByQ.has(row.question_id)) tagsByQ.set(row.question_id, []);
      tagsByQ.get(row.question_id)!.push(row.tag_id);
    }
  }

  const list: QuestionSummaryDto[] = res.results.map((r) => ({
    id: r.id,
    type: r.type,
    difficulty: r.difficulty,
    sourceKind: r.source_kind,
    examYear: r.exam_year,
    currentRevision: r.current_revision,
    topics: topicsByQ.get(r.id) ?? [],
    tags: tagsByQ.get(r.id) ?? [],
  }));

  return c.json(list);
});

questionsRoute.get('/:id', async (c) => {
  const id = c.req.param('id');
  const revisionQuery = c.req.query('revision');
  const db = c.env.DB;
  const user = c.var.user;

  const q = await db
    .prepare(
      'SELECT id, type, difficulty, current_revision FROM questions WHERE id = ? AND active = 1',
    )
    .bind(id)
    .first<{ id: string; type: QuestionType; difficulty: number; current_revision: number }>();
  if (!q) {
    return c.json({ error: { code: 'NOT_FOUND', message: '题目不存在' } }, 404);
  }

  const targetRevision = revisionQuery ? Number(revisionQuery) : q.current_revision;
  const rev = await db
    .prepare(
      'SELECT question_id, revision, type, stem_md, options_json FROM question_revisions WHERE question_id = ? AND revision = ?',
    )
    .bind(id, targetRevision)
    .first<{
      question_id: string;
      revision: number;
      type: QuestionType;
      stem_md: string;
      options_json: string | null;
    }>();
  if (!rev) {
    return c.json({ error: { code: 'NOT_FOUND', message: '题目版本不存在' } }, 404);
  }

  // 附带该用户的当前标记状态
  const userState = await db
    .prepare(
      'SELECT manual_review, starred, last_result FROM user_question_state WHERE user_id = ? AND question_id = ?',
    )
    .bind(user.id, id)
    .first<{ manual_review: number; starred: number; last_result: string | null }>();

  const dto: QuestionDetailDto = {
    id: rev.question_id,
    revision: rev.revision,
    type: rev.type,
    difficulty: q.difficulty,
    stemMd: rev.stem_md,
    options: rev.options_json ? JSON.parse(rev.options_json) : null,
    userState: userState
      ? {
          manualReview: Boolean(userState.manual_review),
          starred: Boolean(userState.starred),
          lastResult: userState.last_result as AttemptResult | null,
        }
      : null,
  };

  return c.json(dto);
});
