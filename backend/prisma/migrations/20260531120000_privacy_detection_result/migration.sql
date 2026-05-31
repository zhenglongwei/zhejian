-- B-MASK-04: privacy_detection_result + media/desensitize 风险摘要

CREATE TABLE `privacy_detection_result` (
    `id` VARCHAR(191) NOT NULL,
    `image_id` VARCHAR(191) NOT NULL,
    `case_id` VARCHAR(191) NOT NULL DEFAULT '',
    `detect_type` VARCHAR(191) NOT NULL,
    `result_json` JSON NOT NULL,
    `risk_level` VARCHAR(191) NOT NULL DEFAULT '',
    `masked_path` VARCHAR(512) NOT NULL DEFAULT '',
    `status` VARCHAR(191) NOT NULL DEFAULT 'success',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `privacy_detection_result_image_id_case_id_detect_type_key`(`image_id`, `case_id`, `detect_type`),
    INDEX `privacy_detection_result_image_id_idx`(`image_id`),
    INDEX `privacy_detection_result_case_id_idx`(`case_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `media_assets`
  ADD COLUMN `privacy_risk_level` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `risk_tags` JSON NOT NULL DEFAULT ('[]'),
  ADD COLUMN `engine_version` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `privacy_detected_at` DATETIME(3) NULL;

ALTER TABLE `desensitize_assets`
  ADD COLUMN `risk_level` VARCHAR(191) NOT NULL DEFAULT '';
