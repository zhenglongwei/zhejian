-- CreateTable
CREATE TABLE `user_favorites` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `target_type` VARCHAR(16) NOT NULL,
    `target_id` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `user_favorites_user_id_target_type_target_id_key`(`user_id`, `target_type`, `target_id`),
    INDEX `user_favorites_user_id_target_type_created_at_idx`(`user_id`, `target_type`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_vehicles` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `brand` VARCHAR(64) NOT NULL DEFAULT '',
    `series` VARCHAR(64) NOT NULL DEFAULT '',
    `model_year` VARCHAR(16) NOT NULL DEFAULT '',
    `plate_display` VARCHAR(32) NOT NULL DEFAULT '',
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_vehicles_user_id_deleted_at_idx`(`user_id`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_favorites` ADD CONSTRAINT `user_favorites_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_vehicles` ADD CONSTRAINT `user_vehicles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
