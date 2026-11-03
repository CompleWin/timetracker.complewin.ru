CREATE TABLE `notion_databases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`database_id` text NOT NULL,
	`data_source_id` text NOT NULL,
	`title` text NOT NULL,
	`property_ids` text NOT NULL,
	`project_mode` text NOT NULL,
	`project_prop_id` text,
	`project_prop_name` text,
	`project_prop_type` text,
	`block_position` text NOT NULL,
	`is_default` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `notion_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notion_databases_user_data_source_idx` ON `notion_databases` (`user_id`,`data_source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notion_databases_user_default_idx` ON `notion_databases` (`user_id`) WHERE "notion_databases"."is_default" = 1;--> statement-breakpoint
ALTER TABLE `projects` ADD `notion_database_id` text REFERENCES notion_databases(id);