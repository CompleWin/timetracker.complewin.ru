CREATE TABLE `sync_outbox` (
	`task_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_try_at` integer NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sync_outbox_user_next_try_idx` ON `sync_outbox` (`user_id`,`next_try_at`);--> statement-breakpoint
ALTER TABLE `notion_connections` ADD `sync_paused_until` integer;--> statement-breakpoint
ALTER TABLE `notion_connections` ADD `last_sync_at` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `notion_database_id` text REFERENCES notion_databases(id);--> statement-breakpoint
ALTER TABLE `tasks` ADD `notion_page_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `notion_page_url` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `notion_sent` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `notion_synced_at` integer;