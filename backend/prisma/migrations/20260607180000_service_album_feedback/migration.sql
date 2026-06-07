-- U-ALB-10: 用户服务相册问题反馈

CREATE TABLE `service_album_feedback` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `album_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL DEFAULT '',
    `node_id` VARCHAR(191) NOT NULL DEFAULT '',
    `node_title` VARCHAR(191) NOT NULL DEFAULT '',
    `feedback_type` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `images_json` JSON NOT NULL,
    `contact_phone` VARCHAR(191) NOT NULL DEFAULT '',
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `service_album_feedback_album_id_idx`(`album_id`),
    INDEX `service_album_feedback_user_album_node_idx`(`user_id`, `album_id`, `node_id`),
    INDEX `service_album_feedback_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
