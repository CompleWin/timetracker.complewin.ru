ALTER TABLE `notion_databases` ADD `status_prop_id` text;--> statement-breakpoint
ALTER TABLE `notion_databases` ADD `status_prop_name` text;--> statement-breakpoint
ALTER TABLE `notion_databases` ADD `skipped_status_ids` text;--> statement-breakpoint
ALTER TABLE `notion_databases` ADD `pull_next_cursor` text;--> statement-breakpoint
ALTER TABLE `notion_databases` ADD `pull_latest_edit` integer;--> statement-breakpoint
UPDATE `notion_databases` SET `pull_cursor` = NULL, `pulled_at` = NULL;
