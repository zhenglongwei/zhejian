-- ALB-UX-14 · VIN 解析本地缓存（全平台共用）
CREATE TABLE `vin_decode_caches` (
  `vin` VARCHAR(17) NOT NULL,
  `vehicle_json` JSON NOT NULL,
  `source` VARCHAR(32) NOT NULL DEFAULT 'aliyun',
  `hit_count` INT NOT NULL DEFAULT 0,
  `last_hit_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`vin`),
  INDEX `vin_decode_caches_last_hit_at_idx` (`last_hit_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
