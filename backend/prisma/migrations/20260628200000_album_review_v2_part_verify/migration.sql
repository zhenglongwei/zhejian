-- 评价四维 + 配件验真

ALTER TABLE `service_album_reviews`
    ADD COLUMN `repair_score` DOUBLE NOT NULL DEFAULT 0 AFTER `scores_json`,
    ADD COLUMN `album_score` DOUBLE NOT NULL DEFAULT 0 AFTER `repair_score`;

CREATE TABLE `service_album_part_verifications` (
    `id` VARCHAR(191) NOT NULL,
    `album_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL DEFAULT '',
    `merchant_id` VARCHAR(191) NOT NULL DEFAULT '',
    `part_key` VARCHAR(191) NOT NULL,
    `part_name` VARCHAR(191) NOT NULL DEFAULT '',
    `part_type` VARCHAR(191) NOT NULL DEFAULT '',
    `status` VARCHAR(191) NOT NULL DEFAULT 'skipped',
    `note` TEXT NOT NULL,
    `images_json` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `service_album_part_verifications_album_user_part_key`(`album_id`, `user_id`, `part_key`),
    INDEX `service_album_part_verifications_store_status_idx`(`store_id`, `status`),
    INDEX `service_album_part_verifications_album_id_idx`(`album_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
