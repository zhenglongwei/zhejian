-- 商家入驻字段扩展
ALTER TABLE `merchants` ADD COLUMN `owner_user_id` VARCHAR(191) NOT NULL DEFAULT '';
ALTER TABLE `merchants` ADD COLUMN `contact_name` VARCHAR(191) NOT NULL DEFAULT '';
ALTER TABLE `merchants` ADD COLUMN `contact_phone` VARCHAR(191) NOT NULL DEFAULT '';
ALTER TABLE `merchants` ADD COLUMN `reject_reason` VARCHAR(512) NOT NULL DEFAULT '';
ALTER TABLE `merchants` ADD COLUMN `submitted_at` DATETIME(3) NULL;
ALTER TABLE `merchants` ADD COLUMN `approved_at` DATETIME(3) NULL;

CREATE INDEX `merchants_owner_user_id_idx` ON `merchants`(`owner_user_id`);

ALTER TABLE `stores` ADD COLUMN `address` VARCHAR(512) NOT NULL DEFAULT '';
ALTER TABLE `stores` ADD COLUMN `phone` VARCHAR(32) NOT NULL DEFAULT '';
ALTER TABLE `stores` ADD COLUMN `services_json` JSON NULL;
ALTER TABLE `stores` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT';

UPDATE `stores` SET `services_json` = JSON_ARRAY() WHERE `services_json` IS NULL;
UPDATE `stores` SET `status` = 'ACTIVE' WHERE 1 = 1;

ALTER TABLE `stores` MODIFY COLUMN `services_json` JSON NOT NULL;
