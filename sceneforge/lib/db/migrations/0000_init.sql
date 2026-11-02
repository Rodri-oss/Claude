CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`checkpoint` text NOT NULL,
	`decision` text NOT NULL,
	`snapshot_hash` text DEFAULT '' NOT NULL,
	`scope` text NOT NULL,
	`amount_usd` real DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `approvals_project_idx` ON `approvals` (`project_id`,`checkpoint`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`kind` text NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`width` integer,
	`height` integer,
	`duration_sec` real,
	`version` integer DEFAULT 1 NOT NULL,
	`parent_asset_id` text,
	`tags` text NOT NULL,
	`provenance` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assets_project_idx` ON `assets` (`project_id`);--> statement-breakpoint
CREATE INDEX `assets_category_idx` ON `assets` (`category`);--> statement-breakpoint
CREATE TABLE `audio_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`dialogue_line_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`provider` text NOT NULL,
	`voice_id` text DEFAULT '' NOT NULL,
	`duration_sec` real NOT NULL,
	`mouth_cues` text DEFAULT '' NOT NULL,
	`cue_fps` integer DEFAULT 24 NOT NULL,
	`text_hash` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`dialogue_line_id`) REFERENCES `dialogue_lines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `budget_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`project_id` text,
	`scene_id` text,
	`shot_id` text,
	`job_id` text,
	`category` text NOT NULL,
	`type` text NOT NULL,
	`amount_usd` real NOT NULL,
	`provider` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`simulated` integer DEFAULT false NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_month_idx` ON `budget_ledger` (`month`);--> statement-breakpoint
CREATE INDEX `ledger_job_idx` ON `budget_ledger` (`job_id`);--> statement-breakpoint
CREATE TABLE `budget_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`monthly_limit_usd` real DEFAULT 250 NOT NULL,
	`allocations` text NOT NULL,
	`warn_threshold` real DEFAULT 0.8 NOT NULL,
	`default_project_limit_usd` real DEFAULT 80 NOT NULL,
	`per_scene_limit_usd` real DEFAULT 30 NOT NULL,
	`per_shot_limit_usd` real DEFAULT 8 NOT NULL,
	`max_generations_per_shot` integer DEFAULT 4 NOT NULL,
	`max_batch_usd` real DEFAULT 40 NOT NULL,
	`reserve_usd` real DEFAULT 15 NOT NULL,
	`kill_switch` integer DEFAULT false NOT NULL,
	`count_simulated` integer DEFAULT true NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `character_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`asset_id` text NOT NULL,
	`approved` integer DEFAULT false NOT NULL,
	`meta` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `variants_char_idx` ON `character_variants` (`character_id`);--> statement-breakpoint
CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`personality` text DEFAULT '' NOT NULL,
	`palette` text NOT NULL,
	`proportions` text DEFAULT '' NOT NULL,
	`identifying_details` text DEFAULT '' NOT NULL,
	`voice_provider` text DEFAULT 'auto' NOT NULL,
	`voice_id` text DEFAULT '' NOT NULL,
	`voice_settings` text NOT NULL,
	`rig` text,
	`locked` integer DEFAULT false NOT NULL,
	`continuity` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `dialogue_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`scene_id` text NOT NULL,
	`seq` integer NOT NULL,
	`character_id` text,
	`speaker_name` text NOT NULL,
	`text` text NOT NULL,
	`emotion` text DEFAULT 'neutral' NOT NULL,
	`speed` real DEFAULT 1 NOT NULL,
	`pronunciation` text NOT NULL,
	`active_audio_id` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `dialogue_scene_idx` ON `dialogue_lines` (`scene_id`,`seq`);--> statement-breakpoint
CREATE TABLE `editor_settings` (
	`project_id` text PRIMARY KEY NOT NULL,
	`tracks` text NOT NULL,
	`music_asset_id` text,
	`ambience_asset_id` text,
	`music_fade_sec` real DEFAULT 2 NOT NULL,
	`transition_frames` integer DEFAULT 12 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `environment_layers` (
	`id` text PRIMARY KEY NOT NULL,
	`environment_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`role` text NOT NULL,
	`order` integer NOT NULL,
	`parallax` real DEFAULT 0.5 NOT NULL,
	`needs_review` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `environments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`time_of_day` text DEFAULT 'day' NOT NULL,
	`variant_of` text,
	`lighting` text NOT NULL,
	`camera_presets` text NOT NULL,
	`background_color` text DEFAULT '#1b1f2a' NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text NOT NULL,
	`project_id` text NOT NULL,
	`number` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_project_uq` ON `episodes` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_series_num_uq` ON `episodes` (`series_id`,`number`);--> statement-breakpoint
CREATE TABLE `exports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`job_id` text,
	`timeline_id` text,
	`dir` text,
	`video_path` text,
	`srt_path` text,
	`manifest_path` text,
	`scene_files` text NOT NULL,
	`width` integer,
	`height` integer,
	`fps` integer,
	`duration_sec` real,
	`size_bytes` integer,
	`validation` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `generation_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`attempt_no` integer NOT NULL,
	`phase` text NOT NULL,
	`provider_job_id` text,
	`request` text,
	`response` text,
	`error` text,
	`error_class` text,
	`started_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`job_id`) REFERENCES `generation_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`shot_id` text,
	`scene_id` text,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`input` text NOT NULL,
	`state` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`is_revision` integer DEFAULT false NOT NULL,
	`paid` integer DEFAULT false NOT NULL,
	`simulated_cost` integer DEFAULT false NOT NULL,
	`budget_category` text DEFAULT 'video' NOT NULL,
	`estimated_cost_usd` real DEFAULT 0 NOT NULL,
	`actual_cost_usd` real,
	`approval_id` text,
	`provider_job_id` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`error` text,
	`error_class` text,
	`result` text,
	`locked_by` text,
	`locked_at` text,
	`next_run_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_state_idx` ON `generation_jobs` (`state`);--> statement-breakpoint
CREATE INDEX `jobs_idem_idx` ON `generation_jobs` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `project_characters` (
	`project_id` text NOT NULL,
	`character_id` text NOT NULL,
	`role` text DEFAULT 'supporting' NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_characters_uq` ON `project_characters` (`project_id`,`character_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`genre` text NOT NULL,
	`preset` text NOT NULL,
	`audience` text DEFAULT 'General' NOT NULL,
	`logline` text DEFAULT '' NOT NULL,
	`synopsis` text DEFAULT '' NOT NULL,
	`source_input` text DEFAULT '' NOT NULL,
	`source_kind` text DEFAULT 'idea' NOT NULL,
	`production_style` text DEFAULT 'dialogue-first' NOT NULL,
	`target_duration_sec` integer DEFAULT 120 NOT NULL,
	`aspect` text DEFAULT '16:9' NOT NULL,
	`width` integer DEFAULT 1920 NOT NULL,
	`height` integer DEFAULT 1080 NOT NULL,
	`fps` integer DEFAULT 24 NOT NULL,
	`stage` text DEFAULT 'idea' NOT NULL,
	`mix` text NOT NULL,
	`budget_limit_usd` real DEFAULT 80 NOT NULL,
	`is_template` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`seq` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`environment_id` text,
	`location_name` text DEFAULT '' NOT NULL,
	`beat_start` text DEFAULT '' NOT NULL,
	`beat_end` text DEFAULT '' NOT NULL,
	`tone` text DEFAULT '' NOT NULL,
	`est_duration_sec` real DEFAULT 0 NOT NULL,
	`actions` text NOT NULL,
	`required_assets` text NOT NULL,
	`music` text DEFAULT '' NOT NULL,
	`ambience` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `scenes_project_idx` ON `scenes` (`project_id`,`seq`);--> statement-breakpoint
CREATE TABLE `series` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shot_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`shot_id` text NOT NULL,
	`version` integer NOT NULL,
	`kind` text NOT NULL,
	`asset_id` text NOT NULL,
	`job_id` text,
	`source` text NOT NULL,
	`status` text DEFAULT 'candidate' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shot_versions_uq` ON `shot_versions` (`shot_id`,`kind`,`version`);--> statement-breakpoint
CREATE TABLE `shots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`scene_id` text NOT NULL,
	`seq` integer NOT NULL,
	`purpose` text DEFAULT '' NOT NULL,
	`duration_sec` real DEFAULT 5 NOT NULL,
	`dialogue_line_ids` text NOT NULL,
	`characters` text NOT NULL,
	`environment_id` text,
	`camera` text NOT NULL,
	`effects` text NOT NULL,
	`transition_in` text DEFAULT 'cut' NOT NULL,
	`sfx` text NOT NULL,
	`references` text NOT NULL,
	`mode` text DEFAULT 'A' NOT NULL,
	`image_prompt` text DEFAULT '' NOT NULL,
	`motion_prompt` text DEFAULT '' NOT NULL,
	`negative_prompt` text DEFAULT '' NOT NULL,
	`image_model` text DEFAULT 'mock/image' NOT NULL,
	`video_model` text DEFAULT 'mock/image-to-video' NOT NULL,
	`generation` text NOT NULL,
	`approval` text DEFAULT 'pending' NOT NULL,
	`estimated_cost_usd` real DEFAULT 0 NOT NULL,
	`actual_cost_usd` real DEFAULT 0 NOT NULL,
	`active_version_id` text,
	`start_image_version_id` text,
	`thumbnail_asset_id` text,
	`trim_start_sec` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shots_project_idx` ON `shots` (`project_id`,`seq`);--> statement-breakpoint
CREATE TABLE `style_bibles` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`art_style` text NOT NULL,
	`palette` text NOT NULL,
	`line_work` text DEFAULT '' NOT NULL,
	`lighting` text DEFAULT '' NOT NULL,
	`camera_language` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `style_bibles_project_id_unique` ON `style_bibles` (`project_id`);--> statement-breakpoint
CREATE TABLE `timelines` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version` integer NOT NULL,
	`data` text NOT NULL,
	`hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
