-- PUB-GEO · VIS-02 按图识图缓存（M2）
CREATE TABLE `album_image_vision_caches` (
  `id` VARCHAR(191) NOT NULL,
  `album_image_id` VARCHAR(191) NOT NULL,
  `album_id` VARCHAR(191) NOT NULL,
  `content_fingerprint` VARCHAR(64) NOT NULL,
  `prompt_version` VARCHAR(64) NOT NULL,
  `model` VARCHAR(64) NOT NULL DEFAULT '',
  `result_json` JSON NOT NULL,
  `hit_count` INT NOT NULL DEFAULT 0,
  `last_hit_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `album_image_vision_caches_album_image_id_prompt_version_key`(`album_image_id`, `prompt_version`),
  INDEX `album_image_vision_caches_album_id_idx`(`album_id`),
  INDEX `album_image_vision_caches_content_fingerprint_idx`(`content_fingerprint`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
