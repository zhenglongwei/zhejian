-- B-MERCH-04: 商家入驻审核留痕 + agreed_at

ALTER TABLE `merchants` ADD COLUMN `agreed_at` DATETIME(3) NULL;

CREATE INDEX `merchants_status_idx` ON `merchants`(`status`);

CREATE TABLE `merchant_review_log` (
    `id` VARCHAR(191) NOT NULL,
    `merchant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL DEFAULT '',
    `reviewer_id` VARCHAR(191) NOT NULL DEFAULT 'system',
    `review_action` VARCHAR(191) NOT NULL,
    `review_comment` TEXT NOT NULL,
    `before_status` VARCHAR(191) NOT NULL DEFAULT '',
    `after_status` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `merchant_review_log_merchant_id_idx`(`merchant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
