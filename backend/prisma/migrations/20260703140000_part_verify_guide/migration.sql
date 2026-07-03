-- 门店填写车主验真方式 + 车主反馈
ALTER TABLE `albums` ADD COLUMN `part_verify_guide_text` TEXT NOT NULL DEFAULT '';
ALTER TABLE `albums` ADD COLUMN `part_verify_guide_informed` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `albums` ADD COLUMN `part_verify_guide_feedback` VARCHAR(32) NOT NULL DEFAULT '';
