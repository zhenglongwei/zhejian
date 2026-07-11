-- CreateTable
CREATE TABLE `authorization_logs` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `auth_type` VARCHAR(64) NOT NULL,
    `business_id` VARCHAR(64) NOT NULL DEFAULT '',
    `auth_status` VARCHAR(32) NOT NULL DEFAULT 'authorized',
    `auth_text_version` VARCHAR(32) NOT NULL,
    `auth_text_snapshot` TEXT NOT NULL,
    `client_type` VARCHAR(32) NOT NULL DEFAULT 'miniprogram',
    `ip` VARCHAR(64) NOT NULL DEFAULT '',
    `device_info` TEXT NOT NULL,
    `remark` VARCHAR(255) NOT NULL DEFAULT '',
    `auth_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revoke_time` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `authorization_logs_user_id_auth_type_idx`(`user_id`, `auth_type`),
    INDEX `authorization_logs_business_id_idx`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `authorization_logs` ADD CONSTRAINT `authorization_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
