CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`shortcode` text NOT NULL,
	`source_url` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`failed_stage` text,
	`container_id` text,
	`media_id` text,
	`object_key` text,
	`video_token` text NOT NULL,
	`publish_attempted` integer DEFAULT 0 NOT NULL,
	`lease_id` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`poll_after` integer DEFAULT 0 NOT NULL,
	`processing_started` integer,
	`cleanup_pending` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_shortcode_unique` ON `jobs` (`shortcode`);--> statement-breakpoint
CREATE TABLE `token_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`fingerprint` text NOT NULL,
	`expires_at` integer NOT NULL,
	`refreshed_at` integer NOT NULL
);
