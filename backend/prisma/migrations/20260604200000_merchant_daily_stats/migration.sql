-- B-STATS-01: 商家门店日指标

CREATE TABLE `merchant_daily_stats` (
    `id` VARCHAR(191) NOT NULL,
    `merchant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `stat_date` DATE NOT NULL,
    `store_view_count` INTEGER NOT NULL DEFAULT 0,
    `service_view_count` INTEGER NOT NULL DEFAULT 0,
    `case_view_count` INTEGER NOT NULL DEFAULT 0,
    `geo_view_count` INTEGER NOT NULL DEFAULT 0,
    `phone_click_count` INTEGER NOT NULL DEFAULT 0,
    `lead_submit_count` INTEGER NOT NULL DEFAULT 0,
    `lead_contacted_count` INTEGER NOT NULL DEFAULT 0,
    `lead_closed_count` INTEGER NOT NULL DEFAULT 0,
    `case_consult_count` INTEGER NOT NULL DEFAULT 0,
    `album_created_count` INTEGER NOT NULL DEFAULT 0,
    `album_completed_count` INTEGER NOT NULL DEFAULT 0,
    `album_complete_rate` DOUBLE NULL,
    `transparency_score` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `merchant_daily_stats_merchant_id_store_id_stat_date_key`(`merchant_id`, `store_id`, `stat_date`),
    INDEX `merchant_daily_stats_merchant_id_stat_date_idx`(`merchant_id`, `stat_date`),
    INDEX `merchant_daily_stats_store_id_stat_date_idx`(`store_id`, `stat_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
