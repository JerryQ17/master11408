import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

export const topics = sqliteTable('topics', {
  id: text('id').primaryKey(),
  parentId: text('parent_id'),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  active: integer('active').notNull().default(1),
});

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  topicId: text('topic_id')
    .notNull()
    .references(() => topics.id),
  title: text('title').notNull(),
  bodyMd: text('body_md').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  contentHash: text('content_hash').notNull(),
  active: integer('active').notNull().default(1),
});

export const questions = sqliteTable('questions', {
  id: text('id').primaryKey(),
  type: text('type', {
    enum: ['single_choice', 'multiple_choice', 'fill_blank', 'written'],
  }).notNull(),
  difficulty: integer('difficulty').notNull().default(1),
  currentRevision: integer('current_revision').notNull().default(1),
  sourceKind: text('source_kind', { enum: ['original', 'exam', 'reference'] }).notNull(),
  examYear: integer('exam_year'),
  active: integer('active').notNull().default(1),
});

export const questionRevisions = sqliteTable(
  'question_revisions',
  {
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id),
    revision: integer('revision').notNull(),
    type: text('type', {
      enum: ['single_choice', 'multiple_choice', 'fill_blank', 'written'],
    }).notNull(),
    metadataJson: text('metadata_json').notNull().default('{}'),
    stemMd: text('stem_md').notNull(),
    optionsJson: text('options_json'),
    answerJson: text('answer_json').notNull(),
    explanationMd: text('explanation_md').notNull(),
    assetsManifestJson: text('assets_manifest_json').notNull().default('[]'),
    contentHash: text('content_hash').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.questionId, table.revision] })],
);

export const questionTopics = sqliteTable(
  'question_topics',
  {
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id),
    topicId: text('topic_id')
      .notNull()
      .references(() => topics.id),
  },
  (table) => [primaryKey({ columns: [table.questionId, table.topicId] })],
);

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  parentId: text('parent_id'),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  examYear: integer('exam_year'),
  active: integer('active').notNull().default(1),
});

export const questionTags = sqliteTable(
  'question_tags',
  {
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id),
  },
  (table) => [primaryKey({ columns: [table.questionId, table.tagId] })],
);

export const contentSyncRuns = sqliteTable('content_sync_runs', {
  id: text('id').primaryKey(),
  gitSha: text('git_sha').notNull(),
  sourceHash: text('source_hash').notNull(),
  targetEnv: text('target_env').notNull(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  status: text('status', { enum: ['running', 'success', 'failed'] }).notNull(),
  summaryJson: text('summary_json').notNull().default('{}'),
});

export const contentSyncLock = sqliteTable('content_sync_lock', {
  id: text('id').primaryKey(),
  ownerToken: text('owner_token').notNull(),
  fencingVersion: integer('fencing_version').notNull(),
  leaseExpiresAt: integer('lease_expires_at').notNull(),
});
