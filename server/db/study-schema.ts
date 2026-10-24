import { sqliteTable, text, integer, primaryKey, unique } from 'drizzle-orm/sqlite-core';
import { user } from './auth-schema';
import { questions } from './content-schema';

export const practiceSessions = sqliteTable(
  'practice_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    filterJson: text('filter_json').notNull().default('{}'),
    creationKey: text('creation_key').notNull(),
    requestHash: text('request_hash').notNull(),
    currentOrdinal: integer('current_ordinal').notNull().default(1),
    progressVersion: integer('progress_version').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    completedAt: integer('completed_at'),
  },
  (table) => [unique().on(table.userId, table.creationKey)],
);

export const practiceSessionItems = sqliteTable(
  'practice_session_items',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => practiceSessions.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id),
    revision: integer('revision').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.ordinal] }),
    unique().on(table.sessionId, table.questionId),
  ],
);

export const attempts = sqliteTable(
  'attempts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id),
    revision: integer('revision').notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => practiceSessions.id),
    ordinal: integer('ordinal').notNull(),
    selectedAnswerJson: text('selected_answer_json'),
    responseText: text('response_text'),
    state: text('state', { enum: ['revealed_pending_self_eval', 'evaluated'] }).notNull(),
    result: text('result', { enum: ['correct', 'partial', 'incorrect'] }),
    submittedAt: integer('submitted_at').notNull(),
    evaluatedAt: integer('evaluated_at'),
    evaluationVersion: integer('evaluation_version').notNull().default(0),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
  },
  (table) => [
    unique().on(table.userId, table.idempotencyKey),
    unique().on(table.sessionId, table.ordinal),
  ],
);

export const attemptEvaluationEvents = sqliteTable(
  'attempt_evaluation_events',
  {
    attemptId: text('attempt_id')
      .notNull()
      .references(() => attempts.id),
    evaluationVersion: integer('evaluation_version').notNull(),
    previousResult: text('previous_result', { enum: ['correct', 'partial', 'incorrect'] }),
    newResult: text('new_result', { enum: ['correct', 'partial', 'incorrect'] }).notNull(),
    changedAt: integer('changed_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.attemptId, table.evaluationVersion] })],
);

export const userQuestionState = sqliteTable(
  'user_question_state',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id),
    lastAttemptId: text('last_attempt_id'),
    latestEvaluatedAttemptId: text('latest_evaluated_attempt_id'),
    attemptCount: integer('attempt_count').notNull().default(0),
    evaluatedCount: integer('evaluated_count').notNull().default(0),
    correctCount: integer('correct_count').notNull().default(0),
    wrongCount: integer('wrong_count').notNull().default(0),
    lastResult: text('last_result', { enum: ['correct', 'partial', 'incorrect'] }),
    manualReview: integer('manual_review').notNull().default(0),
    starred: integer('starred').notNull().default(0),
    stateVersion: integer('state_version').notNull().default(0),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.questionId] })],
);

export const userNoteState = sqliteTable(
  'user_note_state',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    noteId: text('note_id').notNull(),
    readStatus: text('read_status').notNull().default('unread'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.noteId] })],
);
