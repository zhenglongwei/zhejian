-- CreateTable
CREATE TABLE `merchant_service_plans` (
    `id` VARCHAR(191) NOT NULL,
    `merchant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `service_item_id` VARCHAR(191) NOT NULL,
    `category_id` VARCHAR(191) NOT NULL DEFAULT '',
    `name` VARCHAR(191) NOT NULL DEFAULT '',
    `summary` TEXT NOT NULL,
    `detail` TEXT NOT NULL,
    `price_mode` VARCHAR(191) NOT NULL,
    `amount` INTEGER NULL,
    `min_amount` INTEGER NULL,
    `max_amount` INTEGER NULL,
    `price_factors` JSON NOT NULL,
    `included_items` JSON NOT NULL,
    `excluded_items` JSON NOT NULL,
    `appointment_json` JSON NOT NULL,
    `cover_url` VARCHAR(512) NOT NULL DEFAULT '',
    `audit_status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `sale_status` VARCHAR(191) NOT NULL DEFAULT 'OFFLINE',
    `accept_appointment` BOOLEAN NOT NULL DEFAULT true,
    `reject_reason` TEXT NOT NULL,
    `submitted_at` DATETIME(3) NULL,
    `approved_at` DATETIME(3) NULL,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `merchant_service_plans_merchant_id_idx`(`merchant_id`),
    INDEX `merchant_service_plans_store_id_idx`(`store_id`),
    INDEX `merchant_service_plans_audit_status_idx`(`audit_status`),
    INDEX `merchant_service_plans_sale_status_idx`(`sale_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_review_log` (
    `id` VARCHAR(191) NOT NULL,
    `plan_id` VARCHAR(191) NOT NULL,
    `merchant_id` VARCHAR(191) NOT NULL DEFAULT '',
    `store_id` VARCHAR(191) NOT NULL DEFAULT '',
    `reviewer_id` VARCHAR(191) NOT NULL DEFAULT 'system',
    `review_action` VARCHAR(191) NOT NULL,
    `review_comment` TEXT NOT NULL,
    `before_status` VARCHAR(191) NOT NULL DEFAULT '',
    `after_status` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `service_review_log_plan_id_idx`(`plan_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
