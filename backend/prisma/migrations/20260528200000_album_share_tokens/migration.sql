CREATE TABLE `album_share_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `album_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `mode` VARCHAR(191) NOT NULL DEFAULT 'desensitized',
    `channel` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `album_share_tokens_album_id_idx`(`album_id`),
    INDEX `album_share_tokens_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `album_share_tokens` ADD CONSTRAINT `album_share_tokens_album_id_fkey` FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
