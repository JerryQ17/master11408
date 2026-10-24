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

  // 插入测试分类与题目
  await db.batch([
    db
      .prepare(
        'INSERT OR REPLACE INTO topics (id, parent_id, slug, title, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)',
      )
      .bind('test.math', null, 'math', '高等数学', 1),
    db
      .prepare(
        'INSERT OR REPLACE INTO topics (id, parent_id, slug, title, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)',
      )
      .bind('test.math.integral', 'test.math', 'integral', '积分学', 1),
    db
      .prepare(
        'INSERT OR REPLACE INTO notes (id, topic_id, title, body_md, sort_order, content_hash, active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      )
      .bind(
        'test.note.1',
        'test.math.integral',
        '积分笔记',
        '# 积分说明\n$$\\int x dx$$',
        1,
        'hash1',
      ),
    db
      .prepare(
        'INSERT OR REPLACE INTO tags (id, parent_id, name, slug, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)',
      )
      .bind('test.tag.sample', null, '样例分类', 'sample', 1),
    db
      .prepare(
        'INSERT OR REPLACE INTO questions (id, type, difficulty, current_revision, source_kind, active) VALUES (?, ?, ?, ?, ?, 1)',
      )
      .bind('test.q.1', 'single_choice', 2, 1, 'original'),
    db
      .prepare(
        `INSERT OR REPLACE INTO question_revisions (question_id, revision, type, stem_md, options_json, answer_json, explanation_md, content_hash, created_at)
                VALUES (?, 1, 'single_choice', '设 $f(x)=x$，求导', '[{"key":"A","content":"1"},{"key":"B","content":"0"}]', '"A"', '导数为1', 'qhash1', ?)`,
      )
      .bind('test.q.1', Date.now()),
    db
      .prepare('INSERT OR REPLACE INTO question_topics (question_id, topic_id) VALUES (?, ?)')
      .bind('test.q.1', 'test.math.integral'),
    db
      .prepare('INSERT OR REPLACE INTO question_tags (question_id, tag_id) VALUES (?, ?)')
      .bind('test.q.1', 'test.tag.sample'),
  ]);
});

describe('Content API & Security Invariants', () => {
  it('returns topics tree with aggregated question counts', async () => {
    const req = new Request('http://localhost:5173/api/v1/topics/tree', {
      headers: { Cookie: sessionCookie },
    });
    const res = await app.fetch(req, bindings);
    expect(res.status).toBe(200);
    const data = await res.json<any>();
    expect(Array.isArray(data)).toBe(true);
    const mathNode = data.find((n: any) => n.id === 'test.math');
    expect(mathNode).toBeDefined();
    expect(mathNode.questionCount).toBeGreaterThanOrEqual(1);
    expect(mathNode.children.length).toBeGreaterThanOrEqual(1);
  });

  it('fetches notes for a specific topic', async () => {
    const req = new Request('http://localhost:5173/api/v1/topics/test.math.integral/notes', {
      headers: { Cookie: sessionCookie },
    });
    const res = await app.fetch(req, bindings);
    expect(res.status).toBe(200);
    const data = await res.json<any>();
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('积分笔记');
    expect(data[0].bodyMd).toContain('\\int x dx');
  });

  it('whitelists question list and does NOT leak answer or explanation', async () => {
    const req = new Request('http://localhost:5173/api/v1/questions?topicId=test.math.integral', {
      headers: { Cookie: sessionCookie },
    });
    const res = await app.fetch(req, bindings);
    expect(res.status).toBe(200);
    const data = await res.json<any>();
    expect(data.length).toBeGreaterThanOrEqual(1);
    const q = data.find((item: any) => item.id === 'test.q.1');
    expect(q).toBeDefined();
    expect(q.type).toBe('single_choice');
    // 关键安全检查：绝对不得泄露答案或解析
    expect(q.answer).toBeUndefined();
    expect(q.answer_json).toBeUndefined();
    expect(q.explanation).toBeUndefined();
    expect(q.explanationMd).toBeUndefined();
    expect(q.explanation_md).toBeUndefined();
  });

  it('whitelists single question detail and does NOT leak answer or explanation', async () => {
    const req = new Request('http://localhost:5173/api/v1/questions/test.q.1', {
      headers: { Cookie: sessionCookie },
    });
    const res = await app.fetch(req, bindings);
    expect(res.status).toBe(200);
    const q = await res.json<any>();
    expect(q.id).toBe('test.q.1');
    expect(q.stemMd).toBe('设 $f(x)=x$，求导');
    expect(q.options).toHaveLength(2);
    // 关键安全检查：未答题前不得有 answer / explanation
    expect(q.answer).toBeUndefined();
    expect(q.explanation).toBeUndefined();
    expect(q.explanationMd).toBeUndefined();
  });

  it('blocks direct external access to /_solutions/* internal path with 404', async () => {
    const req = new Request('http://localhost:5173/_solutions/secret-image.png');
    const res = await app.fetch(req, bindings);
    expect(res.status).toBe(404);
  });
});
