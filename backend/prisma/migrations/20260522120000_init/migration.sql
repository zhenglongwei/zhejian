-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `nickname` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `orders` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `service_name` VARCHAR(191) NOT NULL DEFAULT '',
    `store_id` VARCHAR(191) NOT NULL DEFAULT '',
    `store_name` VARCHAR(191) NOT NULL DEFAULT '',
    `vehicle_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `orders_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `albums` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `template_id` VARCHAR(191) NOT NULL DEFAULT '',
    `template_name` VARCHAR(191) NOT NULL DEFAULT '',
    `store_note` TEXT NOT NULL,
    `fingerprint` TEXT NOT NULL,
    `public_case_status` VARCHAR(191) NOT NULL DEFAULT 'private',
    `image_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `albums_order_id_key`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `album_nodes` (
    `album_id` VARCHAR(191) NOT NULL,
    `node_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `note` TEXT NOT NULL,
    `updated_at` DATETIME(3) NULL,

    PRIMARY KEY (`album_id`, `node_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `album_images` (
    `id` VARCHAR(191) NOT NULL,
    `album_id` VARCHAR(191) NOT NULL,
    `node_id` VARCHAR(191) NOT NULL,
    `idx` INTEGER NOT NULL DEFAULT 0,
    `raw_url` VARCHAR(512) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `album_images_album_id_node_id_idx`(`album_id`, `node_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `desensitize_tasks` (
    `task_id` VARCHAR(191) NOT NULL,
    `biz_type` VARCHAR(191) NOT NULL,
    `biz_id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NULL,
    `operator_role` VARCHAR(191) NOT NULL,
    `liability_type` VARCHAR(191) NOT NULL,
    `pre_mask_status` VARCHAR(191) NULL,
    `pre_mask_version` INTEGER NOT NULL DEFAULT 0,
    `pre_mask_task_id` VARCHAR(191) NULL,
    `fingerprint` TEXT NOT NULL,
    `from_pre_mask` BOOLEAN NOT NULL DEFAULT false,
    `masking_confirmed` BOOLEAN NOT NULL DEFAULT false,
    `masking_confirmed_at` DATETIME(3) NULL,
    `pre_masked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `desensitize_tasks_biz_id_biz_type_idx`(`biz_id`, `biz_type`),
    PRIMARY KEY (`task_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `desensitize_assets` (
    `task_id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `node_id` VARCHAR(191) NOT NULL,
    `node_title` VARCHAR(191) NOT NULL,
    `idx` INTEGER NOT NULL DEFAULT 0,
    `raw_url` VARCHAR(512) NOT NULL,
    `masked_url` VARCHAR(512) NOT NULL DEFAULT '',
    `pre_masked_url` VARCHAR(512) NOT NULL DEFAULT '',
    `status` VARCHAR(191) NOT NULL,
    `previewed` BOOLEAN NOT NULL DEFAULT false,
    `risk_tags` JSON NOT NULL,

    PRIMARY KEY (`task_id`, `asset_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `album_authorizations` (
    `album_id` VARCHAR(191) NOT NULL,
    `agreed` BOOLEAN NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`album_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `orders` ADD CONSTRAINT `orders_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `albums` ADD CONSTRAINT `albums_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `album_nodes` ADD CONSTRAINT `album_nodes_album_id_fkey` FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `album_images` ADD CONSTRAINT `album_images_album_id_fkey` FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `album_images` ADD CONSTRAINT `album_images_album_id_node_id_fkey` FOREIGN KEY (`album_id`, `node_id`) REFERENCES `album_nodes`(`album_id`, `node_id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `desensitize_assets` ADD CONSTRAINT `desensitize_assets_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `desensitize_tasks`(`task_id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `album_authorizations` ADD CONSTRAINT `album_authorizations_album_id_fkey` FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
