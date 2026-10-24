import { Hono } from 'hono';
import type { AppEnv } from '../context';
import type { StatisticsDto } from '../../shared/types';

export const statisticsRoute = new Hono<AppEnv>();

statisticsRoute.get('/', async (c) => {
  const user = c.var.user;
  const db = c.env.DB;

  // 1. 已做题数 (至少有一次已评价尝试的去重题数)
  const attemptedRow = await db
    .prepare(
      "SELECT count(DISTINCT question_id) as count FROM attempts WHERE user_id = ? AND state = 'evaluated'",
    )
    .bind(user.id)
    .first<{ count: number }>();
  const attemptedCount = attemptedRow?.count ?? 0;

  // 2. 最近结果正确率
  const latestCorrectRow = await db
    .prepare(
      "SELECT count(*) as count FROM user_question_state WHERE user_id = ? AND last_result = 'correct'",
    )
    .bind(user.id)
    .first<{ count: number }>();
  const latestCorrect = latestCorrectRow?.count ?? 0;
  const latestRate =
    attemptedCount > 0 ? Math.round((latestCorrect / attemptedCount) * 1000) / 1000 : null;

  // 3. 历史作答正确率
  const historyRow = await db
    .prepare(
      `
      SELECT
        count(case when result = 'correct' then 1 end) as correct_attempts,
        count(*) as total_attempts
      FROM attempts
      WHERE user_id = ? AND state = 'evaluated'
    `,
    )
    .bind(user.id)
    .first<{ correct_attempts: number; total_attempts: number }>();
  const historyCorrect = historyRow?.correct_attempts ?? 0;
  const historyTotal = historyRow?.total_attempts ?? 0;
  const historyRate =
    historyTotal > 0 ? Math.round((historyCorrect / historyTotal) * 1000) / 1000 : null;

  // 4. 待自评题数 (去重题数，最新尝试仍处于 revealed_pending_self_eval)
  const pendingRow = await db
    .prepare(
      `
      SELECT count(DISTINCT question_id) as count
      FROM attempts a
      WHERE user_id = ? AND state = 'revealed_pending_self_eval'
        AND submitted_at = (SELECT max(submitted_at) FROM attempts WHERE user_id = a.user_id AND question_id = a.question_id)
    `,
    )
    .bind(user.id)
    .first<{ count: number }>();
  const pendingSelfEvalCount = pendingRow?.count ?? 0;

  // 5. 待复习题数
  const reviewRow = await db
    .prepare(
      "SELECT count(*) as count FROM user_question_state WHERE user_id = ? AND (manual_review = 1 OR last_result IN ('partial', 'incorrect'))",
    )
    .bind(user.id)
    .first<{ count: number }>();
  const reviewCount = reviewRow?.count ?? 0;

  const result: StatisticsDto = {
    attemptedCount,
    latestAccuracy: {
      correct: latestCorrect,
      total: attemptedCount,
      rate: latestRate,
    },
    historyAccuracy: {
      correct: historyCorrect,
      total: historyTotal,
      rate: historyRate,
    },
    pendingSelfEvalCount,
    reviewCount,
  };

  return c.json(result);
});
