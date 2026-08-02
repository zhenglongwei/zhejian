-- REV-MOD: 车主追评（一相册一车主最多一次）
-- MySQL TEXT/JSON 不宜带 DEFAULT；先可空再回填，再收紧 NOT NULL
ALTER TABLE `service_album_reviews`
  ADD COLUMN `follow_up_content` VARCHAR(300) NOT NULL DEFAULT '',
  ADD COLUMN `follow_up_images_json` JSON NULL,
  ADD COLUMN `follow_up_images_masked_json` JSON NULL,
  ADD COLUMN `follow_up_images_mask_status` VARCHAR(191) NOT NULL DEFAULT 'none',
  ADD COLUMN `follow_up_at` DATETIME(3) NULL;

UPDATE `service_album_reviews`
SET
  `follow_up_images_json` = CAST('[]' AS JSON),
  `follow_up_images_masked_json` = CAST('[]' AS JSON)
WHERE `follow_up_images_json` IS NULL
   OR `follow_up_images_masked_json` IS NULL;

ALTER TABLE `service_album_reviews`
  MODIFY COLUMN `follow_up_images_json` JSON NOT NULL,
  MODIFY COLUMN `follow_up_images_masked_json` JSON NOT NULL;
