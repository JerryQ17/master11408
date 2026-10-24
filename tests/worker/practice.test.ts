import { env } from 'cloudflare:workers';
import { describe, expect, it, beforeAll } from 'vitest';
import app from '../../server/index';
import type { Bindings } from '../../server/env';
import { createTestUserSession } from './setup';

const bindings = env as Bindings;
const db = bindings.DB;

let sessionCookie: string;

beforeAll(async () => {
  const session = await createTestUserSession(
    db,
    bindings.BETTER_AUTH_SECRET || 'isolated-worker-test-secret-at-least-32-characters',
  );
  sessionCookie = session.sessionCookie;

  // 插入单选与多选测试题
  await db.batch([
    db
      .prepare(
        'INSERT OR REPLACE INTO questions (id, type, difficulty, current_revision, source_kind, active) VALUES (?, ?, ?, ?, ?, 1)',
      )
      .bind('prac.sc.1', 'single_choice', 2, 1, 'original'),
    db
      .prepare(
        `INSERT OR REPLACE INTO question_revisions (question_id, revision, type, stem_md, options_json, answer_json, explanation_md, content_hash, created_at)
                VALUES (?, 1, 'single_choice', '1+1=?', '[{"key":"A","content":"2"},{"key":"B","content":"3"}]', '"A"', '1+1等于2', 'h1', ?)`,
      )
      .bind('prac.sc.1', Date.now()),
    db
      .prepare(
        'INSERT OR REPLACE INTO questions (id, type, difficulty, current_revision, source_kind, active) VALUES (?, ?, ?, ?, ?, 1)',
      )
      .bind('prac.mc.1', 'multiple_choice', 3, 1, 'original'),
    db
      .prepare(
        `INSERT OR REPLACE INTO question_revisions (question_id, revision, type, stem_md, options_json, answer_json, explanation_md, content_hash, created_at)
                VALUES (?, 1, 'multiple_choice', '质数有（多选）：', '[{"key":"A","content":"2"},{"key":"B","content":"4"},{"key":"C","content":"5"}]', '["A","C"]', '2和5是质数', 'h2', ?)`,
      )
      .bind('prac.mc.1', Date.now()),
  ]);
});

describe('Practice Session & Objective Attempts API', () => {
  let createdSessionId: string;
  let scOrdinal: number;
  let mcOrdinal: number;

  it('creates a practice session with requested count and filters', async () => {
    const req = new Request('http://localhost:5173/api/v1/practice-sessions', {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
      },
      body: JSON.stringify({
        types: ['single_choice', 'multiple_choice'],
        count: 10,
        mode: 'ordered',
        creationKey: 'key-test-session-1',
      }),
    });
    const res = await app.fetch(req, bindings);
    expect(res.status).toBe(200);
    const data = await res.json<any>();
    expect(data.sessionId).toBeDefined();
    expect(data.count).toBeGreaterThanOrEqual(2);
    createdSessionId = data.sessionId;

    const detailRes = await app.fetch(
      new Request(`http://localhost:5173/api/v1/practice-sessions/${createdSessionId}`, {
        headers: { Cookie: sessionCookie },
      }),
      bindings,
    );
    const detail = await detailRes.json<any>();
    scOrdinal = detail.items.find((i: any) => i.questionId === 'prac.sc.1').ordinal;
    mcOrdinal = detail.items.find((i: any) => i.questionId === 'prac.mc.1').ordinal;
  });

  it('replays same sessionId when given the same creationKey', async () => {
    const req = new Request('http://localhost:5173/api/v1/practice-sessions', {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
      },
      body: JSON.stringify({
        types: ['single_choice', 'multiple_choice'],
        count: 10,
        mode: 'ordered',
        creationKey: 'key-test-session-1',
      }),
    });
    const res = await app.fetch(req, bindings);
    expect(res.status).toBe(200);
    const data = await res.json<any>();
    expect(data.sessionId).toBe(createdSessionId);
  });

  it('reads item at single-choice ordinal without solution before submitting', async () => {
    const req = new Request(
      `http://localhost:5173/api/v1/practice-sessions/${createdSessionId}/items/${scOrdinal}`,
      {
        headers: { Cookie: sessionCookie },
      },
    );
    const res = await app.fetch(req, bindings);
    expect(res.status).toBe(200);
    const item = await res.json<any>();
    expect(item.ordinal).toBe(scOrdinal);
    expect(item.question.stemMd).toBeDefined();
    expect(item.attempt).toBeNull();
    // 关键安全验证：提交前 solution 必须为 null
    expect(item.solution).toBeNull();
  });

  it('submits a correct single choice attempt, writes to DB and reveals solution', async () => {
    const submitReq = new Request('http://localhost:5173/api/v1/attempts/submit', {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
      },
      body: JSON.stringify({
        practiceSessionId: createdSessionId,
        ordinal: scOrdinal,
        revision: 1,
        selectedKeys: ['A'],
        idempotencyKey: 'idemp-sc-1',
      }),
    });
    const submitRes = await app.fetch(submitReq, bindings);
    expect(submitRes.status).toBe(200);
    const result = await submitRes.json<any>();
    expect(result.result).toBe('correct');
    expect(result.correctAnswer).toBe('A');
    expect(result.explanationMd).toBe('1+1等于2');

    // 重新获取该条目时，应返回用户 attempt 及 solution
    const viewReq = new Request(
      `http://localhost:5173/api/v1/practice-sessions/${createdSessionId}/items/${scOrdinal}`,
      {
        headers: { Cookie: sessionCookie },
      },
    );
    const viewRes = await app.fetch(viewReq, bindings);
    const viewData = await viewRes.json<any>();
    expect(viewData.attempt).toBeDefined();
    expect(viewData.attempt.result).toBe('correct');
    expect(viewData.solution).toBeDefined();
    expect(viewData.solution.correctAnswer).toBe('A');
  });

  it('replays attempt when retried with same idempotencyKey', async () => {
    const retryReq = new Request('http://localhost:5173/api/v1/attempts/submit', {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
      },
      body: JSON.stringify({
        practiceSessionId: createdSessionId,
        ordinal: scOrdinal,
        revision: 1,
        selectedKeys: ['A'],
        idempotencyKey: 'idemp-sc-1',
      }),
    });
    const res = await app.fetch(retryReq, bindings);
    expect(res.status).toBe(200);
    const result = await res.json<any>();
    expect(result.result).toBe('correct');
  });

  it('rejects duplicate submission to already attempted item with different key (409 ITEM_ALREADY_ATTEMPTED)', async () => {
    const conflictReq = new Request('http://localhost:5173/api/v1/attempts/submit', {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
      },
      body: JSON.stringify({
        practiceSessionId: createdSessionId,
        ordinal: scOrdinal,
        revision: 1,
        selectedKeys: ['B'],
        idempotencyKey: 'idemp-different-key',
      }),
    });
    const res = await app.fetch(conflictReq, bindings);
    expect(res.status).toBe(409);
    const err = await res.json<any>();
    expect(err.error.code).toBe('ITEM_ALREADY_ATTEMPTED');
  });

  it('grades multiple choice correctly (requires all correct keys)', async () => {
    const partialReq = new Request('http://localhost:5173/api/v1/attempts/submit', {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
      },
      body: JSON.stringify({
        practiceSessionId: createdSessionId,
        ordinal: mcOrdinal,
        revision: 1,
        selectedKeys: ['A'], // 漏选 C
        idempotencyKey: 'idemp-mc-partial',
      }),
    });
    const partialRes = await app.fetch(partialReq, bindings);
    expect(partialRes.status).toBe(200);
    const data = await partialRes.json<any>();
    expect(data.result).toBe('incorrect');
    expect(data.correctAnswer).toEqual(['A', 'C']);
  });
});
