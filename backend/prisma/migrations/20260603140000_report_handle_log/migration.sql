-- OPS-RPT-03: 举报处置留痕

CREATE TABLE `report_handle_log` (
    `id` VARCHAR(191) NOT NULL,
    `report_id` VARCHAR(191) NOT NULL,
    `reviewer_id` VARCHAR(191) NOT NULL DEFAULT 'admin_system',
    `handle_action` VARCHAR(191) NOT NULL,
    `handle_comment` TEXT NOT NULL,
    `before_status` VARCHAR(191) NOT NULL DEFAULT '',
    `after_status` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `report_handle_log_report_id_idx`(`report_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
