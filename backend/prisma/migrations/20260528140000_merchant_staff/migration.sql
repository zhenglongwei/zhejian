-- CreateTable: 商家主体 / 门店 / 员工（同小程序双角色）
CREATE TABLE `merchants` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL DEFAULT '',
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `stores` (
    `id` VARCHAR(191) NOT NULL,
    `merchant_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `stores_merchant_id_idx`(`merchant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `merchant_staff` (
    `id` VARCHAR(191) NOT NULL,
    `merchant_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL DEFAULT '',
    `role` VARCHAR(191) NOT NULL DEFAULT 'owner',
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `merchant_staff_merchant_id_user_id_key`(`merchant_id`, `user_id`),
    INDEX `merchant_staff_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `stores` ADD CONSTRAINT `stores_merchant_id_fkey` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `merchant_staff` ADD CONSTRAINT `merchant_staff_merchant_id_fkey` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `merchant_staff` ADD CONSTRAINT `merchant_staff_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
