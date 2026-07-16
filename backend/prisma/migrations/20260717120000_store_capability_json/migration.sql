-- 门店能力资产 JSON（技师/设备/品牌/不承接/待审快照）
ALTER TABLE `stores` ADD COLUMN `capability_json` JSON NOT NULL DEFAULT (JSON_OBJECT()) AFTER `photos_json`;
