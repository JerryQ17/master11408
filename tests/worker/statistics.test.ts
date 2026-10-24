import { env } from 'cloudflare:workers';
import { describe, expect, it, beforeAll } from 'vitest';
import app from '../../server/index';
import type { Bindings } from '../../server/env';
import type { StatisticsDto } from '../../shared/types';
import { recomputeUserQuestionState } from '../../server/routes/attempts';
import { createTestUserSession } from './setup';

const bindings = env as Bindings;
const db = bindings.DB;

let testUserId: string;
let sessionCookie: string;

beforeAll(async () => {
  const session = await createTestUserSession(
    db,
    bindings.BETTER_AUTH_SECRET || 'isolated-worker-test-secret-at-least-32-characters',
  );
  testUserId = session.userId;
  sessionCookie = session.sessionCookie;

  // 插入题目
  await db.batch([
    db
      .prepare(
        'INSERT OR REPLACE INTO questions (id, type, difficulty, current_revision, source_kind, active) VALUES (?, ?, ?, ?, ?, 1)',
      )
      .bind('stat.q.1', 'single_choice', 3, 1, 'original'),
    db
      .prepare(
        `INSERT OR REPLACE INTO question_revisions (question_id, revision, type, stem_md, answer_json, explanation_md, content_hash, created_at)
                VALUES (?, 1, 'single_choice', '统计测试题', '"A"', '解析', 'stathash1', ?)`,
      )
      .bind('stat.q.1', Date.now()),
    db
      .prepare(
        'INSERT OR REPLACE INTO questions (id, type, difficulty, current_revision, source_kind, active) VALUES (?, ?, ?, ?, ?, 1)',
      )
      .bind('stat.q.pending', 'written', 3, 1, 'original'),
    db
      .prepare(
        `INSERT OR REPLACE INTO question_revisions (question_id, revision, type, stem_md, answer_json, explanation_md, content_hash, created_at)
                VALUES (?, 1, 'written', '待自评测试题', '"参考答案"', '解析', 'stathash2', ?)`,
      )
      .bind('stat.q.pending', Date.now()),
  ]);
});

describe('Statistics Accuracy Invariants (Scenario 10)', () => {
  it('calculates 9 wrong + 1 right: latestAccuracy is 1/1, historyAccuracy is 1/10', async () => {
    const now = Date.now();
    const baseTime = now - 100000;

    for (let i = 1; i <= 10; i++) {
      const sessId = `stat-sess-${i}`;
      await db
        .prepare(
          `
        INSERT INTO practice_sessions (id, user_id, filter_json, creation_key, request_hash, current_ordinal, progress_version, created_at, updated_at)
        VALUES (?, ?, '{}', ?, 'reqhash', 1, 0, ?, ?)
      `,
        )
        .bind(sessId, testUserId, `key-${sessId}`, now, now)
        .run();

      await db
        .prepare(
          `
        INSERT INTO practice_session_items (session_id, ordinal, question_id, revision)
        VALUES (?, 1, 'stat.q.1', 1)
      `,
        )
        .bind(sessId)
        .run();

      const result = i === 10 ? 'correct' : 'incorrect';
      await db
        .prepare(
          `
        INSERT INTO attempts (id, user_id, question_id, revision, session_id, ordinal, state, result, submitted_at, evaluated_at, evaluation_version, idempotency_key, request_hash)
        VALUES (?, ?, 'stat.q.1', 1, ?, 1, 'evaluated', ?, ?, ?, 0, ?, 'dummy-hash')
      `,
        )
        .bind(
          crypto.randomUUID(),
          testUserId,
          sessId,
          result,
          baseTime + i * 1000,
          baseTime + i * 1000,
          `idemp-stat-${i}`,
        )
        .run();
    }

    await recomputeUserQuestionState(db, testUserId, 'stat.q.1');

    const res = await app.fetch(
      new Request('http://localhost:5173/api/v1/statistics', {
        headers: { Cookie: sessionCookie },
      }),
      bindings,
    );
    expect(res.status).toBe(200);
    const stats = await res.json<StatisticsDto>();

    expect(stats.attemptedCount).toBe(1);
    expect(stats.latestAccuracy.correct).toBe(1);
    expect(stats.latestAccuracy.total).toBe(1);
    expect(stats.latestAccuracy.rate).toBe(1);

    expect(stats.historyAccuracy.correct).toBe(1);
    expect(stats.historyAccuracy.total).toBe(10);
    expect(stats.historyAccuracy.rate).toBe(0.1);
  });

  it('keeps pending_self_eval out of denominator and counts in pendingSelfEvalCount', async () => {
    const pendingSessId = crypto.randomUUID();
    const now = Date.now();
    await db
      .prepare(
        `
      INSERT INTO practice_sessions (id, user_id, filter_json, creation_key, request_hash, current_ordinal, progress_version, created_at, updated_at)
      VALUES (?, ?, '{}', 'pending-key', 'pending-req', 1, 0, ?, ?)
    `,
      )
      .bind(pendingSessId, testUserId, now, now)
      .run();

    await db
      .prepare(
        `
      INSERT INTO practice_session_items (session_id, ordinal, question_id, revision)
      VALUES (?, 1, 'stat.q.pending', 1)
    `,
      )
      .bind(pendingSessId)
      .run();

    // 插入处于 revealed_pending_self_eval 的作答
    await db
      .prepare(
        `
      INSERT INTO attempts (id, user_id, question_id, revision, session_id, ordinal, state, result, submitted_at, evaluated_at, evaluation_version, idempotency_key, request_hash)
      VALUES (?, ?, 'stat.q.pending', 1, ?, 1, 'revealed_pending_self_eval', NULL, ?, NULL, 0, 'idemp-pending-1', 'pending-hash')
    `,
      )
      .bind(crypto.randomUUID(), testUserId, pendingSessId, Date.now())
      .run();

    await recomputeUserQuestionState(db, testUserId, 'stat.q.pending');

    const res = await app.fetch(
      new Request('http://localhost:5173/api/v1/statistics', {
        headers: { Cookie: sessionCookie },
      }),
      bindings,
    );
    const stats = await res.json<StatisticsDto>();

    // attemptedCount 依然是 1（待自评不进入分母）
    expect(stats.attemptedCount).toBe(1);
    expect(stats.latestAccuracy.total).toBe(1);
    expect(stats.historyAccuracy.total).toBe(10);
    // 待自评题数正确计为 1
    expect(stats.pendingSelfEvalCount).toBe(1);
  });
});
