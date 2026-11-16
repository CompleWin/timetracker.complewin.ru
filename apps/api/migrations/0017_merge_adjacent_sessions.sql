CREATE TABLE `session_merge_plan` AS
WITH `ordered` AS (
	SELECT `id`, `task_id`, `started_at`, `ended_at`, `note`, `reminded_at`,
		CASE WHEN `started_at` - LAG(`ended_at`) OVER `task_order` BETWEEN 0 AND 60000 THEN 0 ELSE 1 END AS `starts_chain`
	FROM `time_entries`
	WHERE `deleted_at` IS NULL
	WINDOW `task_order` AS (PARTITION BY `task_id` ORDER BY `started_at`, `id`)
),
`chained` AS (
	SELECT *, SUM(`starts_chain`) OVER (PARTITION BY `task_id` ORDER BY `started_at`, `id`) AS `chain_no`
	FROM `ordered`
),
`grouped` AS (
	SELECT `id`, `task_id`,
		FIRST_VALUE(`id`) OVER `chain` AS `head_id`,
		COUNT(*) OVER `chain` AS `chain_size`,
		LAST_VALUE(`ended_at`) OVER `chain` AS `chain_ended_at`,
		LAST_VALUE(`reminded_at`) OVER `chain` AS `chain_reminded_at`,
		COALESCE(GROUP_CONCAT(NULLIF(`note`, ''), char(10)) OVER `chain`, '') AS `chain_note`
	FROM `chained`
	WINDOW `chain` AS (PARTITION BY `task_id`, `chain_no` ORDER BY `started_at`, `id` ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
)
SELECT `id`, `task_id`, `head_id`, `chain_ended_at`, `chain_reminded_at`, `chain_note`
FROM `grouped`
WHERE `chain_size` > 1 AND length(`chain_note`) <= 10000;
--> statement-breakpoint
UPDATE `time_entries`
SET `deleted_at` = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
	`ended_at` = COALESCE(`ended_at`, MAX(`started_at`, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)))
WHERE `id` IN (SELECT `id` FROM `session_merge_plan` WHERE `id` != `head_id`);
--> statement-breakpoint
UPDATE `time_entries`
SET `ended_at` = (SELECT `chain_ended_at` FROM `session_merge_plan` WHERE `session_merge_plan`.`id` = `time_entries`.`id`),
	`note` = (SELECT `chain_note` FROM `session_merge_plan` WHERE `session_merge_plan`.`id` = `time_entries`.`id`),
	`reminded_at` = (SELECT `chain_reminded_at` FROM `session_merge_plan` WHERE `session_merge_plan`.`id` = `time_entries`.`id`)
WHERE `id` IN (SELECT `id` FROM `session_merge_plan` WHERE `id` = `head_id`);
--> statement-breakpoint
INSERT INTO `sync_outbox` (`task_id`, `user_id`, `attempts`, `next_try_at`, `last_error`, `created_at`)
SELECT `tasks`.`id`, `tasks`.`user_id`, 0,
	CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), NULL,
	CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM `tasks`
WHERE `tasks`.`notion_page_id` IS NOT NULL
	AND `tasks`.`id` IN (SELECT `task_id` FROM `session_merge_plan`)
	AND EXISTS (
		SELECT 1 FROM `notion_connections`
		WHERE `notion_connections`.`user_id` = `tasks`.`user_id` AND `notion_connections`.`access_token_enc` IS NOT NULL
	)
ON CONFLICT (`task_id`) DO UPDATE SET
	`attempts` = 0,
	`last_error` = NULL,
	`next_try_at` = CASE WHEN `sync_outbox`.`attempts` >= 10 THEN `excluded`.`next_try_at` ELSE `sync_outbox`.`next_try_at` END;
--> statement-breakpoint
DROP TABLE `session_merge_plan`;
