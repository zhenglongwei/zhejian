-- B-MERCH-03：完整入驻字段（主体 / 地图坐标 / 门店照片 / 维修资质）
ALTER TABLE `merchants`
    ADD COLUMN `legal_name` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `credit_code` VARCHAR(32) NOT NULL DEFAULT '',
    ADD COLUMN `license_photo_url` VARCHAR(512) NOT NULL DEFAULT '',
    ADD COLUMN `contact_email` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `qualification_json` JSON NOT NULL DEFAULT ('{}');

ALTER TABLE `stores`
    ADD COLUMN `latitude` DOUBLE NULL,
    ADD COLUMN `longitude` DOUBLE NULL,
    ADD COLUMN `business_hours` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `intro` TEXT NOT NULL,
    ADD COLUMN `photos_json` JSON NOT NULL DEFAULT ('{}');
