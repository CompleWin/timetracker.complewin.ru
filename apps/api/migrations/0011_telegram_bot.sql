ALTER TABLE `time_entries` ADD `reminded_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `reminder_threshold_min` integer DEFAULT 180 NOT NULL;