-- U-SRCH-08: 用户云端搜索历史

CREATE TABLE `user_search_history` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `keyword` VARCHAR(128) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_search_history_user_id_keyword_key`(`user_id`, `keyword`),
    INDEX `user_search_history_user_id_updated_at_idx`(`user_id`, `updated_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `user_search_history_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
