DROP INDEX `notion_databases_user_default_idx`;--> statement-breakpoint
ALTER TABLE `notion_databases` DROP COLUMN `is_default`;--> statement-breakpoint
DELETE FROM `sync_outbox` WHERE `task_id` IN (SELECT `id` FROM `tasks` WHERE `notion_page_id` IS NULL);
