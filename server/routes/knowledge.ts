import { Hono } from 'hono';
import type { AppEnv } from '../context';
import type {
  NoteSummaryDto,
  NoteDetailDto,
  LinkedQuestionDto,
  GraphNodeDto,
  GraphEdgeDto,
  KnowledgeGraphDto,
} from '../../shared/types';

export const knowledgeRoute = new Hono<AppEnv>();

type Topic = { id: string; title: string; parent_id: string | null };
type Reference = { source_note_id: string; target_note_id: string };

async function catalog(db: D1Database) {
  const [topicResult, noteResult, referenceResult] = await Promise.all([
    db
      .prepare('SELECT id, title, parent_id FROM topics WHERE active = 1 ORDER BY sort_order, id')
      .all<Topic>(),
    db
      .prepare('SELECT id, topic_id, title FROM notes WHERE active = 1 ORDER BY sort_order, id')
      .all<{ id: string; topic_id: string; title: string }>(),
    db
      .prepare(
        'SELECT source_note_id, target_note_id FROM note_references ORDER BY source_note_id, target_note_id',
      )
      .all<Reference>(),
  ]);
  const topics = new Map(topicResult.results.map((t) => [t.id, t]));
  function ancestors(id: string): string[] {
    const result: string[] = [];
    let current: string | null = id;
    while (current) {
      if (result.includes(current)) return [];
      const topic = topics.get(current);
      if (!topic) return [];
      result.push(current);
      current = topic.parent_id;
    }
    return result;
  }
  const notes = new Map<string, NoteSummaryDto>();
  for (const n of noteResult.results) {
    const path = ancestors(n.topic_id);
    const subjectId = path.at(-1);
    if (subjectId) notes.set(n.id, { id: n.id, title: n.title, topicId: n.topic_id, subjectId });
  }
  return {
    topics,
    notes,
    ancestors,
    references: referenceResult.results.filter(
      (r) => notes.has(r.source_note_id) && notes.has(r.target_note_id),
    ),
    subjects: topicResult.results
      .filter((t) => !t.parent_id)
      .map((t) => ({ id: t.id, title: t.title })),
  };
}

async function questionsForNote(db: D1Database, noteId: string) {
  const result = await db
    .prepare(
      `SELECT q.id, q.type, q.difficulty FROM question_notes qn
     JOIN questions q ON q.id = qn.question_id AND q.active = 1
     WHERE qn.note_id = ? ORDER BY q.id`,
    )
    .bind(noteId)
    .all<LinkedQuestionDto>();
  return result.results;
}

async function notesForQuestion(db: D1Database, questionId: string) {
  return (
    await db
      .prepare('SELECT note_id FROM question_notes WHERE question_id = ? ORDER BY note_id')
      .bind(questionId)
      .all<{ note_id: string }>()
  ).results.map((r) => r.note_id);
}

function noteNode(note: NoteSummaryDto): GraphNodeDto {
  return {
    id: `note:${note.id}`,
    entityId: note.id,
    kind: 'note',
    title: note.title,
    topicId: note.topicId,
  };
}
function questionNode(q: LinkedQuestionDto): GraphNodeDto {
  return { id: `question:${q.id}`, entityId: q.id, kind: 'question', title: q.id };
}
function edge(kind: GraphEdgeDto['kind'], source: string, target: string): GraphEdgeDto {
  return { id: JSON.stringify([kind, source, target]), kind, source, target };
}

knowledgeRoute.get('/notes/:id', async (c) => {
  const db = c.env.DB;
  const data = await catalog(db);
  const note = data.notes.get(c.req.param('id'));
  if (!note) return c.json({ error: { message: '笔记不存在' } }, 404);
  const [body, questions] = await Promise.all([
    db
      .prepare('SELECT body_md, sort_order FROM notes WHERE id = ?')
      .bind(note.id)
      .first<{ body_md: string; sort_order: number }>(),
    questionsForNote(db, note.id),
  ]);
  const dto: NoteDetailDto = {
    ...note,
    bodyMd: body!.body_md,
    sortOrder: body!.sort_order,
    questions,
    references: data.references
      .filter((r) => r.source_note_id === note.id)
      .map((r) => data.notes.get(r.target_note_id)!),
    backlinks: data.references
      .filter((r) => r.target_note_id === note.id)
      .map((r) => data.notes.get(r.source_note_id)!),
  };
  return c.json(dto);
});

knowledgeRoute.get('/questions/:id/notes', async (c) => {
  const id = c.req.param('id');
  const question = await c.env.DB.prepare('SELECT id FROM questions WHERE id = ? AND active = 1')
    .bind(id)
    .first();
  if (!question) return c.json({ error: { message: '题目不存在' } }, 404);
  const [data, ids] = await Promise.all([catalog(c.env.DB), notesForQuestion(c.env.DB, id)]);
  return c.json(ids.flatMap((noteId) => (data.notes.get(noteId) ? [data.notes.get(noteId)!] : [])));
});

knowledgeRoute.get('/graph/local', async (c) => {
  const noteId = c.req.query('noteId');
  const questionId = c.req.query('questionId');
  if (Boolean(noteId) === Boolean(questionId)) {
    return c.json({ error: { message: '请指定一个笔记或习题' } }, 400);
  }
  const db = c.env.DB;
  const data = await catalog(db);
  const nodes = new Map<string, GraphNodeDto>();
  const edges: GraphEdgeDto[] = [];
  if (noteId) {
    const note = data.notes.get(noteId);
    if (!note) return c.json({ error: { message: '笔记不存在' } }, 404);
    nodes.set(`note:${note.id}`, noteNode(note));
    for (const r of data.references) {
      if (r.source_note_id !== noteId && r.target_note_id !== noteId) continue;
      for (const id of [r.source_note_id, r.target_note_id])
        nodes.set(`note:${id}`, noteNode(data.notes.get(id)!));
      edges.push(edge('reference', `note:${r.source_note_id}`, `note:${r.target_note_id}`));
    }
    for (const q of await questionsForNote(db, noteId)) {
      nodes.set(`question:${q.id}`, questionNode(q));
      edges.push(edge('tests', `question:${q.id}`, `note:${noteId}`));
    }
  } else {
    const q = await db
      .prepare('SELECT id, type, difficulty FROM questions WHERE id = ? AND active = 1')
      .bind(questionId!)
      .first<LinkedQuestionDto>();
    if (!q) return c.json({ error: { message: '题目不存在' } }, 404);
    nodes.set(`question:${q.id}`, questionNode(q));
    for (const id of await notesForQuestion(db, q.id)) {
      const n = data.notes.get(id);
      if (!n) continue;
      nodes.set(`note:${id}`, noteNode(n));
      edges.push(edge('tests', `question:${q.id}`, `note:${id}`));
    }
  }
  return c.json({
    nodes: [...nodes.values()],
    edges,
    subjects: data.subjects,
    topics: [],
  } satisfies KnowledgeGraphDto);
});

knowledgeRoute.get('/graph', async (c) => {
  const data = await catalog(c.env.DB);
  const subjectId = c.req.query('subjectId');
  if (!subjectId || !data.subjects.some((s) => s.id === subjectId)) {
    return c.json({ error: { message: '请选择有效科目' } }, 400);
  }
  const topicId = c.req.query('topicId');
  if (topicId && !data.ancestors(topicId).includes(subjectId)) {
    return c.json({ error: { message: '章节不属于当前科目' } }, 400);
  }
  const visible = [...data.notes.values()].filter(
    (n) => n.subjectId === subjectId && (!topicId || data.ancestors(n.topicId).includes(topicId)),
  );
  const ids = new Set(visible.map((n) => n.id));
  const nodes = visible.map(noteNode);
  const edges = data.references
    .filter((r) => ids.has(r.source_note_id) && ids.has(r.target_note_id))
    .map((r) => edge('reference', `note:${r.source_note_id}`, `note:${r.target_note_id}`));
  const expandNoteId = c.req.query('expandNoteId');
  if (expandNoteId) {
    if (!ids.has(expandNoteId))
      return c.json({ error: { message: '展开的笔记不在当前范围内' } }, 400);
    const questions = await questionsForNote(c.env.DB, expandNoteId);
    nodes.push(...questions.map(questionNode));
    const questionIds = new Set(questions.map((q) => q.id));
    const links = await c.env.DB.prepare(
      `SELECT qn.question_id, qn.note_id FROM question_notes qn
       JOIN question_notes selected ON selected.question_id = qn.question_id
       WHERE selected.note_id = ? ORDER BY qn.question_id, qn.note_id`,
    )
      .bind(expandNoteId)
      .all<{ question_id: string; note_id: string }>();
    for (const link of links.results) {
      if (questionIds.has(link.question_id) && ids.has(link.note_id)) {
        edges.push(edge('tests', `question:${link.question_id}`, `note:${link.note_id}`));
      }
    }
  }
  return c.json({
    nodes,
    edges,
    subjects: data.subjects,
    topics: [...data.topics.values()]
      .filter((t) => data.ancestors(t.id).includes(subjectId))
      .map((t) => ({ id: t.id, title: t.title, parentId: t.parent_id })),
  } satisfies KnowledgeGraphDto);
});
