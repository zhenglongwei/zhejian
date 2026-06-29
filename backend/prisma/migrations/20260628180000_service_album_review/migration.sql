-- Phase 2: 车主服务评价（绑定服务相册，非订单交易评价）

CREATE TABLE `service_album_reviews` (
    `id` VARCHAR(191) NOT NULL,
    `album_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL DEFAULT '',
    `merchant_id` VARCHAR(191) NOT NULL DEFAULT '',
    `scores_json` JSON NOT NULL,
    `overall_score` DOUBLE NOT NULL DEFAULT 0,
    `content` TEXT NOT NULL,
    `tags_json` JSON NOT NULL,
    `images_json` JSON NOT NULL,
    `authorize_public` BOOLEAN NOT NULL DEFAULT false,
    `consent` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(191) NOT NULL DEFAULT 'submitted',
    `merchant_reply` TEXT NOT NULL,
    `merchant_reply_at` DATETIME(3) NULL,
    `merchant_replier_id` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `service_album_reviews_album_user_key`(`album_id`, `user_id`),
    INDEX `service_album_reviews_merchant_created_idx`(`merchant_id`, `created_at`),
    INDEX `service_album_reviews_store_status_idx`(`store_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
