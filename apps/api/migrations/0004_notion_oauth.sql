CREATE TABLE `notion_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`workspace_name` text NOT NULL,
	`workspace_icon` text,
	`bot_id` text,
	`duplicated_template_id` text,
	`access_token_enc` text,
	`refresh_token_enc` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notion_connections_user_id_unique` ON `notion_connections` (`user_id`);--> statement-breakpoint
CREATE TABLE `notion_oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
