CREATE TABLE `topics` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_topics_parent_sort` ON `topics` (`parent_id`, `sort_order`);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`title` text NOT NULL,
	`body_md` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`content_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_notes_topic_sort` ON `notes` (`topic_id`, `sort_order`);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`difficulty` integer DEFAULT 1 NOT NULL,
	`current_revision` integer DEFAULT 1 NOT NULL,
	`source_kind` text NOT NULL,
	`exam_year` integer,
	`active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_questions_filter` ON `questions` (`type`, `exam_year`, `active`);
--> statement-breakpoint
CREATE TABLE `question_revisions` (
	`question_id` text NOT NULL,
	`revision` integer NOT NULL,
	`type` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`stem_md` text NOT NULL,
	`options_json` text,
	`answer_json` text NOT NULL,
	`explanation_md` text NOT NULL,
	`assets_manifest_json` text DEFAULT '[]' NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`question_id`, `revision`),
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `question_topics` (
	`question_id` text NOT NULL,
	`topic_id` text NOT NULL,
	PRIMARY KEY(`question_id`, `topic_id`),
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_question_topics_topic` ON `question_topics` (`topic_id`, `question_id`);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`exam_year` integer,
	`active` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tags_parent` ON `tags` (`parent_id`);
--> statement-breakpoint
CREATE TABLE `question_tags` (
	`question_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`question_id`, `tag_id`),
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_question_tags_tag` ON `question_tags` (`tag_id`, `question_id`);
--> statement-breakpoint
CREATE TABLE `content_sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`git_sha` text NOT NULL,
	`source_hash` text NOT NULL,
	`target_env` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	`summary_json` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_sync_lock` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_token` text NOT NULL,
	`fencing_version` integer NOT NULL,
	`lease_expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `practice_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`filter_json` text DEFAULT '{}' NOT NULL,
	`creation_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`current_ordinal` integer DEFAULT 1 NOT NULL,
	`progress_version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_practice_sessions_user_creation` ON `practice_sessions` (`user_id`, `creation_key`);
--> statement-breakpoint
CREATE INDEX `idx_practice_sessions_user_updated` ON `practice_sessions` (`user_id`, `updated_at`, `id`);
--> statement-breakpoint
CREATE TABLE `practice_session_items` (
	`session_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`question_id` text NOT NULL,
	`revision` integer NOT NULL,
	PRIMARY KEY(`session_id`, `ordinal`),
	FOREIGN KEY (`session_id`) REFERENCES `practice_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`, `revision`) REFERENCES `question_revisions`(`question_id`, `revision`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_practice_session_items_uniq_question` ON `practice_session_items` (`session_id`, `question_id`);
--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`question_id` text NOT NULL,
	`revision` integer NOT NULL,
	`session_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`selected_answer_json` text,
	`response_text` text,
	`state` text NOT NULL,
	`result` text,
	`submitted_at` integer NOT NULL,
	`evaluated_at` integer,
	`evaluation_version` integer DEFAULT 0 NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`, `revision`) REFERENCES `question_revisions`(`question_id`, `revision`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`, `ordinal`) REFERENCES `practice_session_items`(`session_id`, `ordinal`) ON UPDATE no action ON DELETE cascade,
	CHECK (
		(`state` = 'evaluated' AND `result` IS NOT NULL AND `evaluated_at` IS NOT NULL) OR
		(`state` = 'revealed_pending_self_eval' AND `result` IS NULL AND `evaluated_at` IS NULL)
	)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_attempts_user_idempotency` ON `attempts` (`user_id`, `idempotency_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_attempts_session_ordinal` ON `attempts` (`session_id`, `ordinal`);
--> statement-breakpoint
CREATE INDEX `idx_attempts_user_question_submitted` ON `attempts` (`user_id`, `question_id`, `submitted_at`, `id`);
--> statement-breakpoint
CREATE INDEX `idx_attempts_user_session` ON `attempts` (`user_id`, `session_id`);
--> statement-breakpoint
CREATE TABLE `attempt_evaluation_events` (
	`attempt_id` text NOT NULL,
	`evaluation_version` integer NOT NULL,
	`previous_result` text,
	`new_result` text NOT NULL,
	`changed_at` integer NOT NULL,
	PRIMARY KEY(`attempt_id`, `evaluation_version`),
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_question_state` (
	`user_id` text NOT NULL,
	`question_id` text NOT NULL,
	`last_attempt_id` text,
	`latest_evaluated_attempt_id` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`evaluated_count` integer DEFAULT 0 NOT NULL,
	`correct_count` integer DEFAULT 0 NOT NULL,
	`wrong_count` integer DEFAULT 0 NOT NULL,
	`last_result` text,
	`manual_review` integer DEFAULT 0 NOT NULL,
	`starred` integer DEFAULT 0 NOT NULL,
	`state_version` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `question_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_user_question_manual_review` ON `user_question_state` (`user_id`, `manual_review`);
--> statement-breakpoint
CREATE INDEX `idx_user_question_last_result` ON `user_question_state` (`user_id`, `last_result`);
--> statement-breakpoint
CREATE TABLE `user_note_state` (
	`user_id` text NOT NULL,
	`note_id` text NOT NULL,
	`read_status` text DEFAULT 'unread' NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `note_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);

