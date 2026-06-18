-- GEO-OBS A/B · 爬虫 URL 日聚合 + Prompt 词库与探测结果

CREATE TABLE `crawler_url_daily` (
  `id` VARCHAR(191) NOT NULL,
  `stat_date` DATE NOT NULL,
  `url` VARCHAR(512) NOT NULL,
  `page_type` VARCHAR(32) NOT NULL DEFAULT '',
  `bot_type` VARCHAR(64) NOT NULL DEFAULT '',
  `hit_count` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `crawler_url_daily_stat_date_url_bot_type_key`(`stat_date`, `url`, `bot_type`),
  INDEX `crawler_url_daily_stat_date_idx`(`stat_date`),
  INDEX `crawler_url_daily_page_type_stat_date_idx`(`page_type`, `stat_date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `geo_prompt_probe` (
  `id` VARCHAR(191) NOT NULL,
  `prompt_id` VARCHAR(64) NOT NULL,
  `prompt` TEXT NOT NULL,
  `city` VARCHAR(191) NOT NULL DEFAULT '',
  `service` VARCHAR(191) NOT NULL DEFAULT '',
  `fault` VARCHAR(191) NOT NULL DEFAULT '',
  `topic_slug` VARCHAR(128) NOT NULL DEFAULT '',
  `page_type` VARCHAR(32) NOT NULL DEFAULT '',
  `prompt_type` VARCHAR(8) NOT NULL DEFAULT 'B',
  `source` VARCHAR(32) NOT NULL DEFAULT 'seed',
  `active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `geo_prompt_probe_prompt_id_key`(`prompt_id`),
  INDEX `geo_prompt_probe_active_idx`(`active`),
  INDEX `geo_prompt_probe_topic_slug_idx`(`topic_slug`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `geo_prompt_probe_result` (
  `id` VARCHAR(191) NOT NULL,
  `prompt_id` VARCHAR(64) NOT NULL,
  `engine` VARCHAR(32) NOT NULL DEFAULT 'default',
  `mentioned` BOOLEAN NOT NULL DEFAULT false,
  `cited_url` VARCHAR(512) NOT NULL DEFAULT '',
  `cited_urls_json` JSON NOT NULL,
  `external_domains_json` JSON NOT NULL,
  `raw_hash` VARCHAR(64) NOT NULL DEFAULT '',
  `status` VARCHAR(32) NOT NULL DEFAULT 'ok',
  `error_message` VARCHAR(512) NOT NULL DEFAULT '',
  `probed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `geo_prompt_probe_result_prompt_id_probed_at_idx`(`prompt_id`, `probed_at`),
  INDEX `geo_prompt_probe_result_probed_at_idx`(`probed_at`),
  INDEX `geo_prompt_probe_result_engine_probed_at_idx`(`engine`, `probed_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
