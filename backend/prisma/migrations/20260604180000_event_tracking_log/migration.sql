-- B-TRACK-01: 站外/H5 行为埋点日志

CREATE TABLE `event_tracking_log` (
    `id` VARCHAR(191) NOT NULL,
    `event_id` VARCHAR(191) NOT NULL,
    `event_name` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL DEFAULT '',
    `role` VARCHAR(191) NOT NULL DEFAULT 'user',
    `session_id` VARCHAR(191) NOT NULL DEFAULT '',
    `page_path` VARCHAR(512) NOT NULL DEFAULT '',
    `referrer` VARCHAR(512) NOT NULL DEFAULT '',
    `source` VARCHAR(128) NOT NULL DEFAULT '',
    `channel` VARCHAR(128) NOT NULL DEFAULT '',
    `city` VARCHAR(64) NOT NULL DEFAULT '',
    `event_params` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `event_tracking_log_event_id_key`(`event_id`),
    INDEX `event_tracking_log_event_name_created_at_idx`(`event_name`, `created_at`),
    INDEX `event_tracking_log_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
