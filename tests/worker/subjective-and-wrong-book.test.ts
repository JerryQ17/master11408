import { env } from 'cloudflare:workers';
import { describe, expect, it, beforeAll } from 'vitest';
import app from '../../server/index';
import type { Bindings } from '../../server/env';
import { createTestUserSession } from './setup';

const bindings = env as Bindings;
const db = bindings.DB;

let sessionCookie: string;
let subjectiveSessionId: string;

beforeAll(async () => {
  const session = await createTestUserSession(
    db,
    bindings.BETTER_AUTH_SECRET || 'isolated-worker-test-secret-at-least-32-characters',
  );
  sessionCookie = session.sessionCookie;

  // 插入主观题
  await db.batch([
    db
      .prepare(
        'INSERT OR REPLACE INTO questions (id, type, difficulty, current_revision, source_kind, active) VALUES (?, ?, ?, ?, ?, 1)',
      )
      .bind('subj.written.1', 'written', 4, 1, 'original'),
    db
      .prepare(
        `INSERT OR REPLACE INTO question_revisions (question_id, revision, type, stem_md, answer_json, explanation_md, content_hash, created_at)
                VALUES (?, 1, 'written', '证明勾股定理', '"参考证明步骤：利用正方形面积割补法。"', '解析：构造边长为a+b的正方形展开证明。', 'shash1', ?)`,
      )
      .bind('subj.written.1', Date.now()),
  ]);

  // 创建一个包含该主观题的题组
  const createRes = await app.fetch(
    new Request('http://localhost:5173/api/v1/practice-sessions', {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
      },
      body: JSON.stringify({ types: ['written'], count: 1, creationKey: 'subj-session-key-1' }),
    }),
    bindings,
  );
  const createData = await createRes.json<any>();
  subjectiveSessionId = createData.sessionId;
});

describe('Subjective Question Reveal, Self-Evaluation Correction & Wrong Book Invariants', () => {
  let attemptId: string;

  it('reveals subjective question: saves revealed_pending_self_eval attempt and returns solution', async () => {
    const revealReq = new Request('http://localhost:5173/api/v1/attempts/reveal', {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
      },
      body: JSON.stringify({
        practiceSessionId: subjectiveSessionId,
        ordinal: 1,
        revision: 1,
        responseText: '我的草稿证明',
        idempotencyKey: 'reveal-key-1',
      }),
    });
    const revealRes = await app.fetch(revealReq, bindings);
    expect(revealRes.status).toBe(200);
    const data = await revealRes.json<any>();
    expect(data.state).toBe('revealed_pending_self_eval');
    expect(data.correctAnswer).toContain('参考证明步骤');
    expect(data.explanationMd).toContain('构造边长为a+b的正方形');
    expect(data.evaluationVersion).toBe(0);
    attemptId = data.attemptId;
  });

  it('performs first self-evaluation as incorrect', async () => {
    const evalReq = new Request(
      `http://localhost:5173/api/v1/attempts/${attemptId}/self-evaluation`,
      {
        method: 'PATCH',
        headers: {
          Cookie: sessionCookie,
          'Content-Type': 'application/json',
          Origin: 'http://localhost:5173',
        },
        body: JSON.stringify({
          result: 'incorrect',
          expectedVersion: 0,
        }),
      },
    );
    const evalRes = await app.fetch(evalReq, bindings);
    expect(evalRes.status).toBe(200);
    const data = await evalRes.json<any>();
    expect(data.result).toBe('incorrect');
    expect(data.evaluationVersion).toBe(1);

    // 此时错题本 mode=ever, latest, review 均包含该题
    const wbLatestRes = await app.fetch(
      new Request('http://localhost:5173/api/v1/wrong-book?mode=latest', {
        headers: { Cookie: sessionCookie },
      }),
      bindings,
    );
    const wbLatest = await wbLatestRes.json<any>();
    expect(wbLatest.some((item: any) => item.questionId === 'subj.written.1')).toBe(true);
  });

  it('corrects self-evaluation from incorrect to correct (更正自评重算统计)', async () => {
    const correctEvalReq = new Request(
      `http://localhost:5173/api/v1/attempts/${attemptId}/self-evaluation`,
      {
        method: 'PATCH',
        headers: {
          Cookie: sessionCookie,
          'Content-Type': 'application/json',
          Origin: 'http://localhost:5173',
        },
        body: JSON.stringify({
          result: 'correct',
          expectedVersion: 1,
        }),
      },
    );
    const correctRes = await app.fetch(correctEvalReq, bindings);
    expect(correctRes.status).toBe(200);
    const data = await correctRes.json<any>();
    expect(data.result).toBe('correct');
    expect(data.evaluationVersion).toBe(2);

    // 验证交付决策 3：误评为错误后更正为正确，不再因该次误评计入“曾经做错”
    const wbEverRes = await app.fetch(
      new Request('http://localhost:5173/api/v1/wrong-book?mode=ever', {
        headers: { Cookie: sessionCookie },
      }),
      bindings,
    );
    const wbEver = await wbEverRes.json<any>();
    expect(wbEver.some((item: any) => item.questionId === 'subj.written.1')).toBe(false);

    // 验证审计日志存在
    const logs = await db
      .prepare('SELECT * FROM attempt_evaluation_events WHERE attempt_id = ?')
      .bind(attemptId)
      .all();
    expect(logs.results.length).toBeGreaterThanOrEqual(2);
  });

  it('retains manual review independently when answered correctly', async () => {
    // 1. 手动标为待复习
    const patchStateReq = new Request(
      'http://localhost:5173/api/v1/question-state/subj.written.1',
      {
        method: 'PATCH',
        headers: {
          Cookie: sessionCookie,
          'Content-Type': 'application/json',
          Origin: 'http://localhost:5173',
        },
        body: JSON.stringify({ manualReview: true }),
      },
    );
    const stateRes = await app.fetch(patchStateReq, bindings);
    expect(stateRes.status).toBe(200);

    // 2. 检查 mode=review 包含该题，即便最新结果是 correct
    const wbReviewRes = await app.fetch(
      new Request('http://localhost:5173/api/v1/wrong-book?mode=review', {
        headers: { Cookie: sessionCookie },
      }),
      bindings,
    );
    const wbReview = await wbReviewRes.json<any>();
    expect(wbReview.some((item: any) => item.questionId === 'subj.written.1')).toBe(true);

    // 3. 取消手动复习标记
    const unmarkReq = new Request('http://localhost:5173/api/v1/question-state/subj.written.1', {
      method: 'PATCH',
      headers: {
        Cookie: sessionCookie,
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
      },
      body: JSON.stringify({ manualReview: false }),
    });
    await app.fetch(unmarkReq, bindings);

    // 4. 取消手动标记后，因为最新做对了，自动移出待复习
    const wbReviewRes2 = await app.fetch(
      new Request('http://localhost:5173/api/v1/wrong-book?mode=review', {
        headers: { Cookie: sessionCookie },
      }),
      bindings,
    );
    const wbReview2 = await wbReviewRes2.json<any>();
    expect(wbReview2.some((item: any) => item.questionId === 'subj.written.1')).toBe(false);
  });
});
