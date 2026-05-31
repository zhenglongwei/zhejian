-- OPS-MASK-01: 案例审核留痕

CREATE TABLE `case_review_log` (
    `id` VARCHAR(191) NOT NULL,
    `case_id` VARCHAR(191) NOT NULL,
    `reviewer_id` VARCHAR(191) NOT NULL DEFAULT 'system',
    `review_action` VARCHAR(191) NOT NULL,
    `review_comment` TEXT NOT NULL,
    `before_status` VARCHAR(191) NOT NULL DEFAULT '',
    `after_status` VARCHAR(191) NOT NULL DEFAULT '',
    `risk_level` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `case_review_log_case_id_idx`(`case_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
