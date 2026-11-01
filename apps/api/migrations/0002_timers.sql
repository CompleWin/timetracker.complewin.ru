CREATE TABLE `time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`task_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `time_entries_user_id_idx` ON `time_entries` (`user_id`);--> statement-breakpoint
CREATE INDEX `time_entries_task_started_idx` ON `time_entries` (`task_id`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `time_entries_running_task_idx` ON `time_entries` (`task_id`) WHERE "time_entries"."ended_at" is null;