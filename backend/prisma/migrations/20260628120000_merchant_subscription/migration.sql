-- CreateTable
CREATE TABLE `merchant_subscriptions` (
    `id` VARCHAR(191) NOT NULL,
    `merchant_id` VARCHAR(191) NOT NULL,
    `plan` VARCHAR(191) NOT NULL DEFAULT 'free',
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `started_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,
    `founder_flag` BOOLEAN NOT NULL DEFAULT false,
    `founder_renew_discount` DOUBLE NULL,
    `indexing_sla_deadline` DATETIME(3) NULL,
    `indexing_sla_met` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `merchant_subscriptions_merchant_id_key`(`merchant_id`),
    INDEX `merchant_subscriptions_plan_idx`(`plan`),
    INDEX `merchant_subscriptions_status_idx`(`status`),
    INDEX `merchant_subscriptions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `merchant_payment_orders` (
    `id` VARCHAR(191) NOT NULL,
    `merchant_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `plan` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'created',
    `wx_prepay_id` VARCHAR(128) NOT NULL DEFAULT '',
    `wx_transaction_id` VARCHAR(64) NOT NULL DEFAULT '',
    `paid_at` DATETIME(3) NULL,
    `order_expires_at` DATETIME(3) NULL,
    `notify_payload_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `merchant_payment_orders_merchant_id_created_at_idx`(`merchant_id`, `created_at`),
    INDEX `merchant_payment_orders_status_idx`(`status`),
    INDEX `merchant_payment_orders_wx_transaction_id_idx`(`wx_transaction_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `merchant_subscriptions` ADD CONSTRAINT `merchant_subscriptions_merchant_id_fkey` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `merchant_payment_orders` ADD CONSTRAINT `merchant_payment_orders_merchant_id_fkey` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
