import { parseArgs } from 'node:util';
import { validateContent } from './content-validator.ts';
import { createD1Adapter, type D1Statement } from './d1-adapter.ts';

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean' },
    remote: { type: 'boolean' },
    env: { type: 'string' },
  },
});

const isDryRun = values['dry-run'] ?? false;
const isRemote = values.remote ?? false;
const targetEnv = values.env;

console.log(
  `🚀 开始内容同步 [环境: ${isRemote ? 'remote' : 'local'}${targetEnv ? `:${targetEnv}` : ''}] ${isDryRun ? '(DRY-RUN 预览模式)' : ''}`,
);

const validation = await validateContent();
if (!validation.valid) {
  console.error('❌ 内容校验未通过，终止同步：');
  for (const err of validation.errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

const db = createD1Adapter({ isRemote, env: targetEnv });
const runId = crypto.randomUUID();
const startedAt = Date.now();
const lockOwner = crypto.randomUUID();

interface DbTopic {
  id: string;
  slug: string;
  title: string;
  sort_order: number;
  active: number;
}

interface DbTag {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  sort_order: number;
  exam_year: number | null;
  active: number;
}

interface DbNote {
  id: string;
  content_hash: string;
}

interface DbQuestion {
  id: string;
  current_revision: number;
  active: number;
}

interface DbRevision {
  question_id: string;
  revision: number;
  content_hash: string;
}

try {
  // 1. 一次性获取当前数据库状态（锁、Topics、Tags、Notes、Questions、Revisions）
  const initSql = [
    'SELECT owner_token, fencing_version, lease_expires_at FROM content_sync_lock WHERE id = "singleton";',
    'SELECT id, slug, title, sort_order, active FROM topics;',
    'SELECT id, parent_id, name, slug, sort_order, exam_year, active FROM tags;',
    'SELECT id, content_hash FROM notes;',
    'SELECT id, current_revision, active FROM questions;',
    'SELECT question_id, revision, content_hash FROM question_revisions;',
  ].join('\n');

  const initResults = await db.rawQuery(initSql);
  const lockRow =
    (initResults[0]?.results?.[0] as unknown as
      | {
          owner_token: string;
          fencing_version: number;
          lease_expires_at: number;
        }
      | undefined) ?? null;

  const now = Date.now();
  if (lockRow && lockRow.lease_expires_at > now && !isDryRun) {
    throw new Error(
      `当前数据库已被其他同步任务锁定 (持有者: ${lockRow.owner_token})，请稍后再试。`,
    );
  }
  const fencingVersion = (lockRow?.fencing_version ?? 0) + 1;

  const existingTopics = new Map<string, DbTopic>(
    ((initResults[1]?.results ?? []) as unknown as DbTopic[]).map((r) => [r.id, r]),
  );
  const existingTags = new Map<string, DbTag>(
    ((initResults[2]?.results ?? []) as unknown as DbTag[]).map((r) => [r.id, r]),
  );
  const existingNotes = new Map<string, DbNote>(
    ((initResults[3]?.results ?? []) as unknown as DbNote[]).map((r) => [r.id, r]),
  );
  const existingQuestions = new Map<string, DbQuestion>(
    ((initResults[4]?.results ?? []) as unknown as DbQuestion[]).map((r) => [r.id, r]),
  );
  const existingRevisions = new Map<string, string>(
    ((initResults[5]?.results ?? []) as unknown as DbRevision[]).map((r) => [
      `${r.question_id}:${r.revision}`,
      r.content_hash,
    ]),
  );

  // 2. 统计差异与构建更新批量 SQL
  let topicsAdded = 0;
  let topicsUpdated = 0;
  let tagsAdded = 0;
  let tagsUpdated = 0;
  let notesAdded = 0;
  let notesUpdated = 0;
  let questionsAdded = 0;
  let questionsUpdated = 0;
  let questionsUnchanged = 0;
  let questionsArchived = 0;

  const batchStmts: (D1Statement | string)[] = [];

  // 锁更新
  if (!isDryRun) {
    batchStmts.push(
      db
        .prepare(
          `INSERT INTO content_sync_lock (id, owner_token, fencing_version, lease_expires_at)
         VALUES ('singleton', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET owner_token=excluded.owner_token, fencing_version=excluded.fencing_version, lease_expires_at=excluded.lease_expires_at`,
        )
        .bind(lockOwner, fencingVersion, now + 60000),
    );
  }

  // 同步 Topics (先父后子拓扑顺序)
  const sortedTopics = [...validation.topics.values()].sort((a, b) => {
    if (!a.parentId && b.parentId) return -1;
    if (a.parentId && !b.parentId) return 1;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });

  for (const t of sortedTopics) {
    if (!existingTopics.has(t.id)) {
      topicsAdded++;
      if (!isDryRun) {
        batchStmts.push(
          db
            .prepare(
              'INSERT INTO topics (id, parent_id, slug, title, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)',
            )
            .bind(t.id, t.parentId ?? null, t.slug, t.title, t.sortOrder ?? 0),
        );
      }
    } else {
      topicsUpdated++;
      if (!isDryRun) {
        batchStmts.push(
          db
            .prepare(
              'UPDATE topics SET parent_id=?, slug=?, title=?, sort_order=?, active=1 WHERE id=?',
            )
            .bind(t.parentId ?? null, t.slug, t.title, t.sortOrder ?? 0, t.id),
        );
      }
    }
  }

  // 同步 Tags
  const sortedTags = [...validation.tags.values()].sort((a, b) => {
    if (!a.parentId && b.parentId) return -1;
    if (a.parentId && !b.parentId) return 1;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });

  for (const t of sortedTags) {
    if (!existingTags.has(t.id)) {
      tagsAdded++;
      if (!isDryRun) {
        batchStmts.push(
          db
            .prepare(
              'INSERT INTO tags (id, parent_id, name, slug, sort_order, exam_year, active) VALUES (?, ?, ?, ?, ?, ?, 1)',
            )
            .bind(t.id, t.parentId ?? null, t.name, t.slug, t.sortOrder ?? 0, t.examYear ?? null),
        );
      }
    } else {
      tagsUpdated++;
      if (!isDryRun) {
        batchStmts.push(
          db
            .prepare(
              'UPDATE tags SET parent_id=?, name=?, slug=?, sort_order=?, exam_year=?, active=1 WHERE id=?',
            )
            .bind(t.parentId ?? null, t.name, t.slug, t.sortOrder ?? 0, t.examYear ?? null, t.id),
        );
      }
    }
  }

  // 同步 Notes
  for (const n of validation.notes) {
    const existing = existingNotes.get(n.id);
    if (!existing) {
      notesAdded++;
      if (!isDryRun) {
        batchStmts.push(
          db
            .prepare(
              'INSERT INTO notes (id, topic_id, title, body_md, sort_order, content_hash, active) VALUES (?, ?, ?, ?, ?, ?, 1)',
            )
            .bind(n.id, n.topicId, n.title, n.bodyMd, n.sortOrder ?? 0, n.contentHash),
        );
      }
    } else if (existing.content_hash !== n.contentHash) {
      notesUpdated++;
      if (!isDryRun) {
        batchStmts.push(
          db
            .prepare(
              'UPDATE notes SET topic_id=?, title=?, body_md=?, sort_order=?, content_hash=?, active=1 WHERE id=?',
            )
            .bind(n.topicId, n.title, n.bodyMd, n.sortOrder ?? 0, n.contentHash, n.id),
        );
      }
    }
  }

  // 同步 Questions
  for (const q of validation.questions) {
    const existingQ = existingQuestions.get(q.id);
    const optionsJson = q.options ? JSON.stringify(q.options) : null;
    const answerJson = JSON.stringify(q.answer);

    if (!existingQ) {
      questionsAdded++;
      if (!isDryRun) {
        batchStmts.push(
          db
            .prepare(
              'INSERT INTO questions (id, type, difficulty, current_revision, source_kind, exam_year, active) VALUES (?, ?, ?, 1, ?, ?, 1)',
            )
            .bind(q.id, q.type, q.difficulty, q.sourceKind ?? null, q.examYear ?? null),
          db
            .prepare(
              `INSERT INTO question_revisions (question_id, revision, type, metadata_json, stem_md, options_json, answer_json, explanation_md, assets_manifest_json, content_hash, created_at)
                      VALUES (?, 1, ?, '{}', ?, ?, ?, ?, '[]', ?, ?)`,
            )
            .bind(
              q.id,
              q.type,
              q.stemMd,
              optionsJson,
              answerJson,
              q.explanationMd ?? null,
              q.contentHash,
              now,
            ),
        );
        for (const topicId of q.topics) {
          batchStmts.push(
            db
              .prepare('INSERT INTO question_topics (question_id, topic_id) VALUES (?, ?)')
              .bind(q.id, topicId),
          );
        }
        for (const tagId of q.tags) {
          batchStmts.push(
            db
              .prepare('INSERT INTO question_tags (question_id, tag_id) VALUES (?, ?)')
              .bind(q.id, tagId),
          );
        }
      }
    } else {
      const latestHash = existingRevisions.get(`${q.id}:${existingQ.current_revision}`);
      if (!latestHash || latestHash !== q.contentHash) {
        questionsUpdated++;
        const nextRev = existingQ.current_revision + 1;
        if (!isDryRun) {
          batchStmts.push(
            db
              .prepare(
                'UPDATE questions SET type=?, difficulty=?, current_revision=?, source_kind=?, exam_year=?, active=1 WHERE id=?',
              )
              .bind(q.type, q.difficulty, nextRev, q.sourceKind ?? null, q.examYear ?? null, q.id),
            db
              .prepare(
                `INSERT INTO question_revisions (question_id, revision, type, metadata_json, stem_md, options_json, answer_json, explanation_md, assets_manifest_json, content_hash, created_at)
                        VALUES (?, ?, ?, '{}', ?, ?, ?, ?, '[]', ?, ?)`,
              )
              .bind(
                q.id,
                nextRev,
                q.type,
                q.stemMd,
                optionsJson,
                answerJson,
                q.explanationMd ?? null,
                q.contentHash,
                now,
              ),
            db.prepare('DELETE FROM question_topics WHERE question_id=?').bind(q.id),
            db.prepare('DELETE FROM question_tags WHERE question_id=?').bind(q.id),
          );
          for (const topicId of q.topics) {
            batchStmts.push(
              db
                .prepare('INSERT INTO question_topics (question_id, topic_id) VALUES (?, ?)')
                .bind(q.id, topicId),
            );
          }
          for (const tagId of q.tags) {
            batchStmts.push(
              db
                .prepare('INSERT INTO question_tags (question_id, tag_id) VALUES (?, ?)')
                .bind(q.id, tagId),
            );
          }
        }
      } else {
        questionsUnchanged++;
        if (!isDryRun && existingQ.active === 0) {
          batchStmts.push(db.prepare('UPDATE questions SET active=1 WHERE id=?').bind(q.id));
        }
      }
    }
  }

  // 归档处理
  if (!isDryRun) {
    const currentQuestionIds = new Set(validation.questions.map((q) => q.id));
    for (const [id, q] of existingQuestions.entries()) {
      if (q.active === 1 && !currentQuestionIds.has(id)) {
        batchStmts.push(db.prepare('UPDATE questions SET active = 0 WHERE id = ?').bind(id));
        questionsArchived++;
      }
    }
  }

  // 记录同步审计与释放锁
  const summary = {
    topics: { added: topicsAdded, updated: topicsUpdated },
    tags: { added: tagsAdded, updated: tagsUpdated },
    notes: { added: notesAdded, updated: notesUpdated },
    questions: {
      added: questionsAdded,
      updated: questionsUpdated,
      unchanged: questionsUnchanged,
      archived: questionsArchived,
    },
  };

  if (!isDryRun) {
    batchStmts.push(
      db
        .prepare(
          `INSERT INTO content_sync_runs (id, git_sha, source_hash, target_env, started_at, finished_at, status, summary_json)
         VALUES (?, 'local-workspace', 'source-hash', ?, ?, ?, 'success', ?)`,
        )
        .bind(
          runId,
          targetEnv ?? (isRemote ? 'remote' : 'local'),
          startedAt,
          Date.now(),
          JSON.stringify(summary),
        ),
      db
        .prepare('UPDATE content_sync_lock SET lease_expires_at = 0 WHERE id = ?')
        .bind('singleton'),
    );

    // 一次性批量执行所有更新操作
    await db.batch(batchStmts);
  }

  console.log(`✅ 同步完成！耗时: ${Date.now() - startedAt}ms`);
  console.log(`  - 知识点: 新增 ${topicsAdded}, 更新 ${topicsUpdated}`);
  console.log(`  - 标签: 新增 ${tagsAdded}, 更新 ${tagsUpdated}`);
  console.log(`  - 笔记: 新增 ${notesAdded}, 更新 ${notesUpdated}`);
  console.log(
    `  - 题目: 新增 ${questionsAdded}, 新版本 ${questionsUpdated}, 无变更 ${questionsUnchanged}, 归档 ${questionsArchived}`,
  );
} catch (error) {
  console.error('❌ 同步失败:', error);
  process.exit(1);
}
