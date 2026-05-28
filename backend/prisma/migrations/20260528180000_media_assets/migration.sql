-- B-MEDIA-07: media_assets + desensitize_assets.media_id

CREATE TABLE `media_assets` (
  `id` VARCHAR(191) NOT NULL,
  `object_key` VARCHAR(512) NOT NULL,
  `url` VARCHAR(512) NOT NULL,
  `desensitized_key` VARCHAR(512) NOT NULL DEFAULT '',
  `desensitized_url` VARCHAR(512) NOT NULL DEFAULT '',
  `desensitize_status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `uploader_id` VARCHAR(191) NOT NULL DEFAULT '',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `media_assets_object_key_idx`(`object_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `desensitize_assets`
  ADD COLUMN `media_id` VARCHAR(191) NOT NULL DEFAULT '' AFTER `asset_id`,
  ADD INDEX `desensitize_assets_media_id_idx`(`media_id`);
