import { Hono } from 'hono';
import type { AppEnv } from '../context';
import type { NoteDto, TopicTreeNode } from '../../shared/types';

export const topicsRoute = new Hono<AppEnv>();

topicsRoute.get('/tree', async (c) => {
  const db = c.env.DB;
  const topicsRes = await db
    .prepare(
      'SELECT id, parent_id, slug, title, sort_order FROM topics WHERE active = 1 ORDER BY sort_order ASC, id ASC',
    )
    .all<{
      id: string;
      parent_id: string | null;
      slug: string;
      title: string;
      sort_order: number;
    }>();

  // 计算每个 topic 下的去重题目数
  const countsRes = await db
    .prepare(
      `SELECT qt.topic_id, count(DISTINCT qt.question_id) as count
       FROM question_topics qt
       JOIN questions q ON q.id = qt.question_id
       WHERE q.active = 1
       GROUP BY qt.topic_id`,
    )
    .all<{ topic_id: string; count: number }>();

  const countMap = new Map<string, number>();
  for (const row of countsRes.results) {
    countMap.set(row.topic_id, row.count);
  }

  const nodes = new Map<string, TopicTreeNode>();
  for (const t of topicsRes.results) {
    nodes.set(t.id, {
      id: t.id,
      parentId: t.parent_id,
      slug: t.slug,
      title: t.title,
      sortOrder: t.sort_order,
      questionCount: countMap.get(t.id) ?? 0,
      children: [],
    });
  }

  // 构建树并将子节点题目数汇总到父节点
  const rootNodes: TopicTreeNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  // 递归累加后代题目数
  function aggregateCounts(node: TopicTreeNode): number {
    let sum = node.questionCount;
    for (const child of node.children) {
      sum += aggregateCounts(child);
    }
    node.questionCount = sum;
    return sum;
  }
  for (const root of rootNodes) {
    aggregateCounts(root);
  }

  return c.json(rootNodes);
});

topicsRoute.get('/:topicId/notes', async (c) => {
  const topicId = c.req.param('topicId');
  const includeDescendants = c.req.query('includeDescendants') === 'true';
  const db = c.env.DB;

  let topicIds = [topicId];
  if (includeDescendants) {
    const res = await db
      .prepare(
        `WITH RECURSIVE subtopics AS (
           SELECT id FROM topics WHERE id = ?
           UNION ALL
           SELECT t.id FROM topics t JOIN subtopics s ON t.parent_id = s.id WHERE t.active = 1
         )
         SELECT id FROM subtopics`,
      )
      .bind(topicId)
      .all<{ id: string }>();
    topicIds = res.results.map((r) => r.id);
  }

  const placeholders = topicIds.map(() => '?').join(',');
  const notesRes = await db
    .prepare(
      `SELECT id, topic_id, title, body_md, sort_order
       FROM notes
       WHERE topic_id IN (${placeholders}) AND active = 1
       ORDER BY sort_order ASC, id ASC`,
    )
    .bind(...topicIds)
    .all<{ id: string; topic_id: string; title: string; body_md: string; sort_order: number }>();

  const result: NoteDto[] = notesRes.results.map((r) => ({
    id: r.id,
    topicId: r.topic_id,
    title: r.title,
    bodyMd: r.body_md,
    sortOrder: r.sort_order,
  }));

  return c.json(result);
});
