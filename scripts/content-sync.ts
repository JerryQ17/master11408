import { parseArgs } from 'node:util';

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

if (!isRemote) {
  process.env.XDG_CONFIG_HOME ??= `${process.cwd()}/.wrangler`;
}
process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';

import { validateContent } from './content-validator.ts';
import type { Bindings } from '../server/env.ts';

const { getPlatformProxy } = await import('wrangler');

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

const platform = await getPlatformProxy<Bindings>({
  remoteBindings: isRemote,
  environment: targetEnv,
});
const db = platform.env.DB;
const runId = crypto.randomUUID();
const startedAt = Date.now();
const lockOwner = crypto.randomUUID();

try {
  // 1. 获取锁 (租约 60 秒)
  const lockRow = await db
    .prepare('SELECT * FROM content_sync_lock WHERE id = ?')
    .bind('singleton')
    .first<{
      owner_token: string;
      fencing_version: number;
      lease_expires_at: number;
    }>();

  let fencingVersion = 1;
  const now = Date.now();
  if (lockRow) {
    if (lockRow.lease_expires_at > now && !isDryRun) {
      throw new Error(
        `当前数据库已被其他同步任务锁定 (持有者: ${lockRow.owner_token})，请稍后再试。`,
      );
    }
    fencingVersion = lockRow.fencing_version + 1;
  }

  if (!isDryRun) {
    await db
      .prepare(
        `INSERT INTO content_sync_lock (id, owner_token, fencing_version, lease_expires_at)
       VALUES ('singleton', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET owner_token=excluded.owner_token, fencing_version=excluded.fencing_version, lease_expires_at=excluded.lease_expires_at`,
      )
      .bind(lockOwner, fencingVersion, now + 60000)
      .run();
  }

  // 2. 统计差异
  let topicsAdded = 0;
  let topicsUpdated = 0;
  let tagsAdded = 0;
  let tagsUpdated = 0;
  let notesAdded = 0;
  let notesUpdated = 0;
  let questionsAdded = 0;
  let questionsUpdated = 0;
  let questionsUnchanged = 0;

  // 同步 Topics (先父后子拓扑顺序)
  const sortedTopics = [...validation.topics.values()].sort((a, b) => {
    if (!a.parentId && b.parentId) return -1;
    if (a.parentId && !b.parentId) return 1;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });

  for (const t of sortedTopics) {
    const existing = await db
      .prepare('SELECT id, slug, title, sort_order, active FROM topics WHERE id = ?')
      .bind(t.id)
      .first();
    if (!existing) {
      topicsAdded++;
      if (!isDryRun) {
        await db
          .prepare(
            'INSERT INTO topics (id, parent_id, slug, title, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)',
          )
          .bind(t.id, t.parentId ?? null, t.slug, t.title, t.sortOrder ?? 0)
          .run();
      }
    } else {
      topicsUpdated++;
      if (!isDryRun) {
        await db
          .prepare(
            'UPDATE topics SET parent_id=?, slug=?, title=?, sort_order=?, active=1 WHERE id=?',
          )
          .bind(t.parentId ?? null, t.slug, t.title, t.sortOrder ?? 0, t.id)
          .run();
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
    const existing = await db.prepare('SELECT id FROM tags WHERE id = ?').bind(t.id).first();
    if (!existing) {
      tagsAdded++;
      if (!isDryRun) {
        await db
          .prepare(
            'INSERT INTO tags (id, parent_id, name, slug, sort_order, exam_year, active) VALUES (?, ?, ?, ?, ?, ?, 1)',
          )
          .bind(t.id, t.parentId ?? null, t.name, t.slug, t.sortOrder ?? 0, t.examYear ?? null)
          .run();
      }
    } else {
      tagsUpdated++;
      if (!isDryRun) {
        await db
          .prepare(
            'UPDATE tags SET parent_id=?, name=?, slug=?, sort_order=?, exam_year=?, active=1 WHERE id=?',
          )
          .bind(t.parentId ?? null, t.name, t.slug, t.sortOrder ?? 0, t.examYear ?? null, t.id)
          .run();
      }
    }
  }

  // 同步 Notes
  for (const n of validation.notes) {
    const existing = await db
      .prepare('SELECT id, content_hash FROM notes WHERE id = ?')
      .bind(n.id)
      .first<{ content_hash: string }>();
    if (!existing) {
      notesAdded++;
      if (!isDryRun) {
        await db
          .prepare(
            'INSERT INTO notes (id, topic_id, title, body_md, sort_order, content_hash, active) VALUES (?, ?, ?, ?, ?, ?, 1)',
          )
          .bind(n.id, n.topicId, n.title, n.bodyMd, n.sortOrder ?? 0, n.contentHash)
          .run();
      }
    } else if (existing.content_hash !== n.contentHash) {
      notesUpdated++;
      if (!isDryRun) {
        await db
          .prepare(
            'UPDATE notes SET topic_id=?, title=?, body_md=?, sort_order=?, content_hash=?, active=1 WHERE id=?',
          )
          .bind(n.topicId, n.title, n.bodyMd, n.sortOrder ?? 0, n.contentHash, n.id)
          .run();
      }
    }
  }

  // 同步 Questions (含 revision 增量与原子批次)
  for (const q of validation.questions) {
    const existingQ = await db
      .prepare('SELECT id, current_revision FROM questions WHERE id = ?')
      .bind(q.id)
      .first<{
        current_revision: number;
      }>();

    const optionsJson = q.options ? JSON.stringify(q.options) : null;
    const answerJson = JSON.stringify(q.answer);

    if (!existingQ) {
      questionsAdded++;
      if (!isDryRun) {
        const batch = [
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
        ];
        for (const topicId of q.topics) {
          batch.push(
            db
              .prepare('INSERT INTO question_topics (question_id, topic_id) VALUES (?, ?)')
              .bind(q.id, topicId),
          );
        }
        for (const tagId of q.tags) {
          batch.push(
            db
              .prepare('INSERT INTO question_tags (question_id, tag_id) VALUES (?, ?)')
              .bind(q.id, tagId),
          );
        }
        await db.batch(batch);
      }
    } else {
      const latestRev = await db
        .prepare(
          'SELECT content_hash FROM question_revisions WHERE question_id = ? AND revision = ?',
        )
        .bind(q.id, existingQ.current_revision)
        .first<{ content_hash: string }>();

      if (!latestRev || latestRev.content_hash !== q.contentHash) {
        // 创建新 revision
        questionsUpdated++;
        const nextRev = existingQ.current_revision + 1;
        if (!isDryRun) {
          const batch = [
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
          ];
          for (const topicId of q.topics) {
            batch.push(
              db
                .prepare('INSERT INTO question_topics (question_id, topic_id) VALUES (?, ?)')
                .bind(q.id, topicId),
            );
          }
          for (const tagId of q.tags) {
            batch.push(
              db
                .prepare('INSERT INTO question_tags (question_id, tag_id) VALUES (?, ?)')
                .bind(q.id, tagId),
            );
          }
          await db.batch(batch);
        }
      } else {
        questionsUnchanged++;
        // 确保关联同步
        if (!isDryRun) {
          const batch = [
            db.prepare('DELETE FROM question_topics WHERE question_id=?').bind(q.id),
            db.prepare('DELETE FROM question_tags WHERE question_id=?').bind(q.id),
          ];
          for (const topicId of q.topics) {
            batch.push(
              db
                .prepare('INSERT INTO question_topics (question_id, topic_id) VALUES (?, ?)')
                .bind(q.id, topicId),
            );
          }
          for (const tagId of q.tags) {
            batch.push(
              db
                .prepare('INSERT INTO question_tags (question_id, tag_id) VALUES (?, ?)')
                .bind(q.id, tagId),
            );
          }
          await db.batch(batch);
        }
      }
    }
  }

  // 3. 归档处理 (只有全部更新成功后，标记缺失的旧题目、笔记、分类为 active = 0)
  let questionsArchived = 0;
  if (!isDryRun) {
    const allDbQuestions = (
      await db.prepare('SELECT id FROM questions WHERE active = 1').all<{ id: string }>()
    ).results;
    const currentQuestionIds = new Set(validation.questions.map((q) => q.id));
    for (const row of allDbQuestions) {
      if (!currentQuestionIds.has(row.id)) {
        await db.prepare('UPDATE questions SET active = 0 WHERE id = ?').bind(row.id).run();
        questionsArchived++;
      }
    }
  }

  // 记录同步审计
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
    await db
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
      )
      .run();

    // 释放锁
    await db
      .prepare('UPDATE content_sync_lock SET lease_expires_at = 0 WHERE id = ?')
      .bind('singleton')
      .run();
  }

  console.log(`✅ 同步完成！耗时: ${Date.now() - startedAt}ms`);
  console.log(`  - 知识点: 新增 ${topicsAdded}, 更新 ${topicsUpdated}`);
  console.log(`  - 标签: 新增 ${tagsAdded}, 更新 ${tagsUpdated}`);
  console.log(`  - 笔记: 新增 ${notesAdded}, 更新 ${notesUpdated}`);
  console.log(
    `  - 题目: 新增 ${questionsAdded}, 新版本 ${questionsUpdated}, 无变更 ${questionsUnchanged}, 归档 ${questionsArchived}`,
  );
} finally {
  await platform.dispose();
}
