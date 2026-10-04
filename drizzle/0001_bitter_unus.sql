CREATE TABLE `access_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`attempts` integer NOT NULL,
	`updated_at` integer NOT NULL
);
