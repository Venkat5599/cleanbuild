CREATE TABLE `baselines` (
	`creator_id` integer PRIMARY KEY NOT NULL,
	`fitted_at` integer NOT NULL,
	`coefs` text NOT NULL,
	`sigma_resid` real NOT NULL,
	`n_train` integer NOT NULL,
	`design_dim` integer NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `belief_diffs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`creator_id` integer NOT NULL,
	`experiment_id` integer,
	`created_at` integer NOT NULL,
	`deltas` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `belief_diffs_creator_idx` ON `belief_diffs` (`creator_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `bits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`creator_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bits_creator_name_idx` ON `bits` (`creator_id`,`name`);--> statement-breakpoint
CREATE TABLE `briefs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`creator_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`headline` text DEFAULT '' NOT NULL,
	`features` text NOT NULL,
	`predicted_lift` real NOT NULL,
	`ci_low` real NOT NULL,
	`ci_high` real NOT NULL,
	`rationale` text DEFAULT '' NOT NULL,
	`is_exploratory` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`creator_id` integer NOT NULL,
	`post_id` integer,
	`text` text NOT NULL,
	`embedding` blob,
	`stated_at` integer NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `claims_creator_idx` ON `claims` (`creator_id`,`stated_at`);--> statement-breakpoint
CREATE TABLE `creators` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`handle` text NOT NULL,
	`platform` text NOT NULL,
	`niche` text DEFAULT 'general' NOT NULL,
	`followers` integer DEFAULT 0 NOT NULL,
	`tz` text DEFAULT 'UTC' NOT NULL,
	`exploration_budget` real DEFAULT 0.25 NOT NULL,
	`mind_alias` text,
	`telegram_chat_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creators_platform_handle_idx` ON `creators` (`platform`,`handle`);--> statement-breakpoint
CREATE TABLE `experiments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`creator_id` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`opened_at` integer NOT NULL,
	`next_checkpoint_at` integer,
	`closed_at` integer,
	`reward` real,
	`reward_components` text,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `experiments_post_id_unique` ON `experiments` (`post_id`);--> statement-breakpoint
CREATE INDEX `experiments_creator_status_idx` ON `experiments` (`creator_id`,`status`);--> statement-breakpoint
CREATE INDEX `experiments_due_idx` ON `experiments` (`next_checkpoint_at`);--> statement-breakpoint
CREATE TABLE `features` (
	`post_id` integer PRIMARY KEY NOT NULL,
	`schema_version` integer NOT NULL,
	`hook_type` text NOT NULL,
	`length_bucket` text NOT NULL,
	`thumbnail_archetype` text NOT NULL,
	`publish_slot` text NOT NULL,
	`format` text NOT NULL,
	`topic_cluster` integer NOT NULL,
	`vector` blob NOT NULL,
	`labeled_by` text DEFAULT 'mind' NOT NULL,
	`labeled_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `gate_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`brief_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`rule` text NOT NULL,
	`verdict` text NOT NULL,
	`explanation` text DEFAULT '' NOT NULL,
	`overridden` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`brief_id`) REFERENCES `briefs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `metrics` (
	`post_id` integer NOT NULL,
	`checkpoint` text NOT NULL,
	`collected_at` integer NOT NULL,
	`views` integer,
	`watch_time` integer,
	`comments` integer,
	`likes` integer,
	`follower_delta` integer,
	PRIMARY KEY(`post_id`, `checkpoint`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `niche_priors` (
	`niche` text PRIMARY KEY NOT NULL,
	`updated_at` integer NOT NULL,
	`mu` blob NOT NULL,
	`tau2` real NOT NULL,
	`n_creators` integer DEFAULT 0 NOT NULL,
	`pooled` integer DEFAULT false NOT NULL,
	`dim` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`creator_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	`channel` text NOT NULL,
	`body` text NOT NULL,
	`trigger` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_creator_idx` ON `notifications` (`creator_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `posterior_snapshots` (
	`creator_id` integer NOT NULL,
	`week` integer NOT NULL,
	`taken_at` integer NOT NULL,
	`mu` blob NOT NULL,
	`sigma` blob NOT NULL,
	`n_obs` integer NOT NULL,
	`dim` integer NOT NULL,
	PRIMARY KEY(`creator_id`, `week`),
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `posteriors` (
	`creator_id` integer PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	`mu` blob NOT NULL,
	`sigma` blob NOT NULL,
	`n_obs` integer DEFAULT 0 NOT NULL,
	`dim` integer NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`creator_id` integer NOT NULL,
	`platform_post_id` text NOT NULL,
	`published_at` integer NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`url` text,
	`duration_seconds` integer,
	`followers_at_publish` integer DEFAULT 0 NOT NULL,
	`raw` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_creator_platform_id_idx` ON `posts` (`creator_id`,`platform_post_id`);--> statement-breakpoint
CREATE INDEX `posts_creator_published_idx` ON `posts` (`creator_id`,`published_at`);