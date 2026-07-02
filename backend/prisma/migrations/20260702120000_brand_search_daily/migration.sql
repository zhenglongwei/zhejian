-- GEO-IGAIN-E02 · 品牌词/Direct 隐形归因日聚合

CREATE TABLE `brand_search_daily` (
  `id` VARCHAR(191) NOT NULL,
  `stat_date` DATE NOT NULL,
  `brand_attributed_views` INT NOT NULL DEFAULT 0,
  `direct_views` INT NOT NULL DEFAULT 0,
  `brand_source_views` INT NOT NULL DEFAULT 0,
  `brand_search_submit_views` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `brand_search_daily_stat_date_key`(`stat_date`),
  INDEX `brand_search_daily_stat_date_idx`(`stat_date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
