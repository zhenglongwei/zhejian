-- V2.0 Backend B1: service album + consult leads + public cases

ALTER TABLE `users` ADD COLUMN `phone` VARCHAR(32) NOT NULL DEFAULT '' AFTER `nickname`;

ALTER TABLE `albums`
  MODIFY COLUMN `order_id` VARCHAR(191) NULL,
  ADD COLUMN `user_id` VARCHAR(191) NOT NULL DEFAULT '' AFTER `order_id`,
  ADD COLUMN `merchant_id` VARCHAR(191) NOT NULL DEFAULT '' AFTER `user_id`,
  ADD COLUMN `store_id` VARCHAR(191) NOT NULL DEFAULT '' AFTER `merchant_id`,
  ADD COLUMN `store_name` VARCHAR(191) NOT NULL DEFAULT '' AFTER `store_id`,
  ADD COLUMN `service_id` VARCHAR(191) NOT NULL DEFAULT '' AFTER `store_name`,
  ADD COLUMN `service_name` VARCHAR(191) NOT NULL DEFAULT '' AFTER `service_id`,
  ADD COLUMN `user_phone` VARCHAR(32) NOT NULL DEFAULT '' AFTER `service_name`,
  ADD COLUMN `lead_id` VARCHAR(191) NOT NULL DEFAULT '' AFTER `user_phone`,
  ADD COLUMN `complexity_level` VARCHAR(16) NOT NULL DEFAULT 'L1' AFTER `lead_id`,
  ADD COLUMN `vehicle_json` JSON NULL AFTER `complexity_level`,
  ADD COLUMN `price_mode` VARCHAR(32) NOT NULL DEFAULT '' AFTER `vehicle_json`,
  ADD COLUMN `min_amount` INT NULL AFTER `price_mode`,
  ADD COLUMN `max_amount` INT NULL AFTER `min_amount`,
  ADD COLUMN `parts_json` JSON NOT NULL DEFAULT (JSON_ARRAY()) AFTER `max_amount`,
  ADD COLUMN `pending_confirms_json` JSON NOT NULL DEFAULT (JSON_ARRAY()) AFTER `parts_json`,
  ADD COLUMN `authorization_tier` VARCHAR(32) NOT NULL DEFAULT 'private' AFTER `public_case_status`,
  ADD COLUMN `completed_at` DATETIME(3) NULL AFTER `image_count`;

UPDATE `albums` a
JOIN `orders` o ON a.order_id = o.id
SET
  a.user_id = o.user_id,
  a.store_id = o.store_id,
  a.store_name = o.store_name,
  a.service_name = o.service_name,
  a.vehicle_json = o.vehicle_json;

ALTER TABLE `album_authorizations` ADD COLUMN `tier` VARCHAR(32) NOT NULL DEFAULT 'named' AFTER `status`;

CREATE TABLE `consult_leads` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED',
  `service_id` VARCHAR(191) NOT NULL DEFAULT '',
  `service_name` VARCHAR(191) NOT NULL DEFAULT '',
  `store_id` VARCHAR(191) NOT NULL,
  `store_name` VARCHAR(191) NOT NULL DEFAULT '',
  `store_phone` VARCHAR(32) NOT NULL DEFAULT '',
  `case_id` VARCHAR(191) NOT NULL DEFAULT '',
  `source_page` VARCHAR(64) NOT NULL DEFAULT '',
  `lead_type` VARCHAR(32) NOT NULL DEFAULT 'message',
  `vehicle_json` JSON NULL,
  `description` TEXT NOT NULL,
  `images_json` JSON NOT NULL DEFAULT (JSON_ARRAY()),
  `appointment_json` JSON NULL,
  `contact_json` JSON NULL,
  `is_accident` BOOLEAN NOT NULL DEFAULT false,
  `price_mode` VARCHAR(32) NOT NULL DEFAULT '',
  `platform_consent` BOOLEAN NOT NULL DEFAULT false,
  `close_reason` VARCHAR(32) NULL,
  `close_note` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `consult_leads_user_id_status_idx`(`user_id`, `status`),
  INDEX `consult_leads_store_id_status_idx`(`store_id`, `status`),
  CONSTRAINT `consult_leads_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `lead_status_logs` (
  `id` VARCHAR(191) NOT NULL,
  `lead_id` VARCHAR(191) NOT NULL,
  `from_status` VARCHAR(32) NULL,
  `to_status` VARCHAR(32) NOT NULL,
  `operator_type` VARCHAR(16) NOT NULL,
  `operator_id` VARCHAR(191) NOT NULL DEFAULT '',
  `reason` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `lead_status_logs_lead_id_idx`(`lead_id`),
  CONSTRAINT `lead_status_logs_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `consult_leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `public_cases` (
  `id` VARCHAR(191) NOT NULL,
  `album_id` VARCHAR(191) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending_review',
  `authorization_tier` VARCHAR(32) NOT NULL DEFAULT 'named',
  `title` VARCHAR(191) NOT NULL DEFAULT '',
  `summary` TEXT NOT NULL,
  `cover_image` VARCHAR(512) NOT NULL DEFAULT '',
  `content_json` JSON NULL,
  `store_id` VARCHAR(191) NOT NULL DEFAULT '',
  `store_name` VARCHAR(191) NOT NULL DEFAULT '',
  `service_name` VARCHAR(191) NOT NULL DEFAULT '',
  `city` VARCHAR(64) NOT NULL DEFAULT '',
  `min_amount` INT NULL,
  `max_amount` INT NULL,
  `price_mode` VARCHAR(32) NOT NULL DEFAULT '',
  `published_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `public_cases_album_id_key`(`album_id`),
  INDEX `public_cases_status_idx`(`status`),
  CONSTRAINT `public_cases_album_id_fkey` FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `albums_merchant_id_status_idx` ON `albums`(`merchant_id`, `status`);
CREATE INDEX `albums_user_phone_idx` ON `albums`(`user_phone`);
CREATE INDEX `albums_store_id_idx` ON `albums`(`store_id`);
