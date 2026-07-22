-- 相册级「门店答谢」覆盖配置（inherit / custom / off）
ALTER TABLE `albums`
  ADD COLUMN `publish_thank_you_json` JSON NULL;
