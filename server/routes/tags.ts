import { Hono } from 'hono';
import type { AppEnv } from '../context';
import type { TagTreeNode } from '../../shared/types';

export const tagsRoute = new Hono<AppEnv>();

tagsRoute.get('/tree', async (c) => {
  const db = c.env.DB;
  const tagsRes = await db
    .prepare(
      'SELECT id, parent_id, name, slug, sort_order, exam_year FROM tags WHERE active = 1 ORDER BY sort_order ASC, id ASC',
    )
    .all<{
      id: string;
      parent_id: string | null;
      name: string;
      slug: string;
      sort_order: number;
      exam_year: number | null;
    }>();

  const nodes = new Map<string, TagTreeNode>();
  for (const t of tagsRes.results) {
    nodes.set(t.id, {
      id: t.id,
      parentId: t.parent_id,
      name: t.name,
      slug: t.slug,
      sortOrder: t.sort_order,
      examYear: t.exam_year,
      children: [],
    });
  }

  const rootNodes: TagTreeNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  return c.json(rootNodes);
});
