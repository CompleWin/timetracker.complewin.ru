ALTER TABLE `notion_databases` ADD `pull_cursor` integer;--> statement-breakpoint
ALTER TABLE `notion_databases` ADD `pulled_at` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `title_changed_at` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `project_changed_at` integer;