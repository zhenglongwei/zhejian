-- HOST-PREVIEW · 托管预览独立缓存（文案 + 人工覆盖稿）
CREATE TABLE `host_preview_caches` (
  `album_id` VARCHAR(191) NOT NULL,
  `store_id` VARCHAR(191) NOT NULL DEFAULT '',
  `merchant_id` VARCHAR(191) NOT NULL DEFAULT '',
  `copy_json` JSON NULL,
  `photos_json` JSON NULL,
  `edits_json` JSON NULL,
  `copy_fingerprint` VARCHAR(64) NOT NULL DEFAULT '',
  `photo_fingerprint` VARCHAR(64) NOT NULL DEFAULT '',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `host_preview_caches_store_id_idx`(`store_id`),
  PRIMARY KEY (`album_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
