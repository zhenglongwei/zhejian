-- REV-MOD: 车主追评（一相册一车主最多一次）
-- MariaDB/MySQL：用 JSON_ARRAY() 默认值，避免 CAST('[]' AS JSON)（MariaDB 不支持该写法）
ALTER TABLE `service_album_reviews`
  ADD COLUMN `follow_up_content` VARCHAR(300) NOT NULL DEFAULT '',
  ADD COLUMN `follow_up_images_json` JSON NOT NULL DEFAULT (JSON_ARRAY()),
  ADD COLUMN `follow_up_images_masked_json` JSON NOT NULL DEFAULT (JSON_ARRAY()),
  ADD COLUMN `follow_up_images_mask_status` VARCHAR(191) NOT NULL DEFAULT 'none',
  ADD COLUMN `follow_up_at` DATETIME(3) NULL;
