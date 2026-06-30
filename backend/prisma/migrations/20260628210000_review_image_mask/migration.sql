-- 车主评价配图 · 脱敏后公开展示

ALTER TABLE `service_album_reviews`
    ADD COLUMN `images_masked_json` JSON NOT NULL DEFAULT (JSON_ARRAY()) AFTER `images_json`,
    ADD COLUMN `images_mask_status` VARCHAR(191) NOT NULL DEFAULT 'none' AFTER `images_masked_json`;
