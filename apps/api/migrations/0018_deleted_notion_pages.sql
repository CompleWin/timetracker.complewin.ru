CREATE TABLE `deleted_notion_pages` (
	`user_id` text NOT NULL,
	`page_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `page_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
