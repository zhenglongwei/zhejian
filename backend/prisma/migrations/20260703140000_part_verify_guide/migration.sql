-- 门店填写车主验真方式 + 车主反馈
-- MySQL 不允许 TEXT 列带 DEFAULT，分步添加
ALTER TABLE `albums` ADD COLUMN `part_verify_guide_text` TEXT NULL;
UPDATE `albums` SET `part_verify_guide_text` = '' WHERE `part_verify_guide_text` IS NULL;
ALTER TABLE `albums` MODIFY COLUMN `part_verify_guide_text` TEXT NOT NULL;

ALTER TABLE `albums` ADD COLUMN `part_verify_guide_informed` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `albums` ADD COLUMN `part_verify_guide_feedback` VARCHAR(32) NOT NULL DEFAULT '';
