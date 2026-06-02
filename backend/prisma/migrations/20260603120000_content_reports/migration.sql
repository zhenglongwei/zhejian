-- B-RPT-01: 用户举报虚假信息

CREATE TABLE `content_reports` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `target_type` VARCHAR(191) NOT NULL,
    `target_id` VARCHAR(191) NOT NULL,
    `target_title` VARCHAR(191) NOT NULL DEFAULT '',
    `report_type` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `images_json` JSON NOT NULL,
    `contact_phone` VARCHAR(191) NOT NULL DEFAULT '',
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `resolution` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `content_reports_user_id_target_type_target_id_idx`(`user_id`, `target_type`, `target_id`),
    INDEX `content_reports_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
