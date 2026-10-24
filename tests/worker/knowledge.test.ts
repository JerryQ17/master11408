import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../../server/index';
import type { Bindings } from '../../server/env';
import type { KnowledgeGraphDto, NoteDetailDto, NoteSummaryDto } from '../../shared/types';
import { buildRelationStatements } from '../../scripts/content-relations';
import { createTestUserSession } from './setup';

const bindings = env as Bindings;
const db = bindings.DB;
let cookie: string;
const noteRelations = [
  { id: 'g-a', references: ['g-b', 'g-c', 'g-hidden'] },
  { id: 'g-b', references: ['g-a'] },
];
const questionRelations = [
  { id: 'g-a', notes: ['g-a', 'g-b', 'g-hidden'] },
  { id: 'g-q2', notes: ['g-b'] },
  { id: 'g-q-hidden', notes: ['g-a'] },
];
async function sync(notes = noteRelations, questions = questionRelations) {
  await db.batch(
    buildRelationStatements(notes, questions).map((s) => db.prepare(s.sql).bind(...s.params)),
  );
}
function get(path: string) {
  return app.fetch(
    new Request(`http://localhost:5173/api/v1${path}`, { headers: { Cookie: cookie } }),
    bindings,
  );
}

beforeAll(async () => {
  cookie = (await createTestUserSession(db, bindings.BETTER_AUTH_SECRET!)).sessionCookie;
  await db.batch([
    db.prepare(
      "INSERT INTO topics (id, title, slug) VALUES ('graph.math', '数学', 'math'), ('graph.cs', '计算机', 'cs')",
    ),
    db.prepare(
      "INSERT INTO topics (id, title, slug, parent_id) VALUES ('unrelated-chapter-id', '章节', 'chapter', 'graph.math')",
    ),
    ...[
      ['g-a', 'unrelated-chapter-id', 1],
      ['g-b', 'graph.math', 1],
      ['g-c', 'graph.cs', 1],
      ['g-hidden', 'graph.math', 0],
    ].map(([id, topicId, active]) =>
      db
        .prepare(
          'INSERT INTO notes (id, topic_id, title, body_md, content_hash, active) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(id, topicId, `笔记${id}`, '# 正文', 'hash', active),
    ),
    ...['g-a', 'g-q2', 'g-q-hidden'].flatMap((id) => [
      db
        .prepare(
          "INSERT INTO questions (id, type, source_kind, active) VALUES (?, 'single_choice', 'original', ?)",
        )
        .bind(id, id === 'g-q-hidden' ? 0 : 1),
      db
        .prepare(
          "INSERT INTO question_revisions (question_id, revision, type, stem_md, answer_json, explanation_md, content_hash, created_at) VALUES (?, 1, 'single_choice', '题干', '\"SECRET_ANSWER\"', 'SECRET_SOLUTION', 'hash', 0)",
        )
        .bind(id),
    ]),
  ]);
});
beforeEach(() => sync());

describe('Knowledge relationships and graphs', () => {
  it('returns explicit references, backlinks and many-to-many questions, hiding archived content', async () => {
    const response = await get('/notes/g-a');
    expect(response.status).toBe(200);
    const note = await response.json<NoteDetailDto>();
    expect(note.subjectId).toBe('graph.math');
    expect(note.references.map((n) => n.id)).toEqual(['g-b', 'g-c']);
    expect(note.backlinks.map((n) => n.id)).toEqual(['g-b']);
    expect(note.questions.map((q) => q.id)).toEqual(['g-a']);
    const notes = await (await get('/questions/g-a/notes')).json<NoteSummaryDto[]>();
    expect(notes.map((n) => n.id)).toEqual(['g-a', 'g-b']);
    expect((await get('/notes/g-hidden')).status).toBe(404);
  });

  it('shows notes only by default, uses topic ancestry and limits chapter scope', async () => {
    const graph = await (await get('/graph?subjectId=graph.math')).json<KnowledgeGraphDto>();
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(['note:g-a', 'note:g-b']);
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges).toContainEqual(
      expect.objectContaining({ source: 'note:g-a', target: 'note:g-b', kind: 'reference' }),
    );
    const chapter = await (
      await get('/graph?subjectId=graph.math&topicId=unrelated-chapter-id')
    ).json<KnowledgeGraphDto>();
    expect(chapter.nodes.map((n) => n.entityId)).toEqual(['g-a']);
    expect(chapter.edges).toEqual([]);
    expect((await get('/graph?subjectId=graph.math&topicId=graph.cs')).status).toBe(400);
    expect((await get('/graph?subjectId=unrelated-chapter-id')).status).toBe(400);
  });

  it('expands questions on demand and keeps note and question IDs distinct', async () => {
    const response = await get('/graph?subjectId=graph.math&expandNoteId=g-a');
    const text = await response.text();
    expect(text).not.toContain('SECRET_');
    const graph = JSON.parse(text) as KnowledgeGraphDto;
    expect(graph.nodes.map((n) => n.id)).toContain('question:g-a');
    expect(graph.nodes.map((n) => n.id)).toContain('note:g-a');
    expect(graph.edges).toContainEqual(
      expect.objectContaining({ source: 'question:g-a', target: 'note:g-b', kind: 'tests' }),
    );
    expect(graph.edges).toContainEqual(
      expect.objectContaining({ source: 'question:g-a', target: 'note:g-a', kind: 'tests' }),
    );
    expect((await get('/graph?subjectId=graph.math&expandNoteId=g-c')).status).toBe(400);
  });

  it('returns exactly one hop locally, including cross-subject references and question concepts', async () => {
    const graph = await (await get('/graph/local?noteId=g-a')).json<KnowledgeGraphDto>();
    expect(graph.nodes.map((n) => n.id).sort()).toEqual([
      'note:g-a',
      'note:g-b',
      'note:g-c',
      'question:g-a',
    ]);
    const questionGraph = await (
      await get('/graph/local?questionId=g-a')
    ).json<KnowledgeGraphDto>();
    expect(questionGraph.nodes.map((n) => n.id).sort()).toEqual([
      'note:g-a',
      'note:g-b',
      'question:g-a',
    ]);
    expect(questionGraph.edges.every((e) => e.kind === 'tests')).toBe(true);
    expect((await get('/graph/local?questionId=g-a&noteId=g-a')).status).toBe(400);
    expect((await get('/graph/local?noteId=missing')).status).toBe(404);
  });

  it('removes stale edges when frontmatter changes and is idempotent on re-sync', async () => {
    await sync([{ id: 'g-a', references: [] }], [{ id: 'g-a', notes: [] }]);
    await sync([{ id: 'g-a', references: [] }], [{ id: 'g-a', notes: [] }]);
    const note = await (await get('/notes/g-a')).json<NoteDetailDto>();
    expect(note.references).toEqual([]);
    expect(note.backlinks).toEqual([]);
    expect(note.questions).toEqual([]);
  });

  it('rolls back a failed relationship replacement', async () => {
    await expect(sync([{ id: 'g-a', references: ['missing-note'] }], [])).rejects.toThrow();
    const note = await (await get('/notes/g-a')).json<NoteDetailDto>();
    expect(note.references.map((n) => n.id)).toEqual(['g-b', 'g-c']);
  });

  it('requires authentication on note, backlink and graph endpoints', async () => {
    for (const path of [
      '/notes/g-a',
      '/questions/g-a/notes',
      '/graph?subjectId=graph.math',
      '/graph/local?noteId=g-a',
    ]) {
      const response = await app.fetch(
        new Request(`http://localhost:5173/api/v1${path}`),
        bindings,
      );
      expect(response.status).toBe(401);
    }
  });
});
