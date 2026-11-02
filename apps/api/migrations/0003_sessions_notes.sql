ALTER TABLE `time_entries` ADD `note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `time_entries` ADD `deleted_at` integer;