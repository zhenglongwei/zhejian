-- 商家四档目录价（平台配置）+ 门店特价
CREATE TABLE IF NOT EXISTS `platform_settings` (
    `key` VARCHAR(64) NOT NULL,
    `value_json` JSON NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `stores`
  ADD COLUMN `plan_price_overrides_json` JSON NOT NULL DEFAULT (JSON_OBJECT()) AFTER `capability_json`;
