CREATE TABLE `hidden_gaps` (
	`user_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `started_at`, `ended_at`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `users` ADD `show_gaps` integer DEFAULT true NOT NULL;
