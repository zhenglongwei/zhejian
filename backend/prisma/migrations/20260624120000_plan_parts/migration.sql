-- B-PLAN / B-ALB-09: 方案配件目录与报价表图

ALTER TABLE `albums`
  ADD COLUMN `plan_parts_json` JSON NOT NULL DEFAULT (JSON_ARRAY()) AFTER `parts_json`,
  ADD COLUMN `plan_quote_image_ids` JSON NOT NULL DEFAULT (JSON_ARRAY()) AFTER `plan_parts_json`,
  ADD COLUMN `plan_parts_locked_at` DATETIME(3) NULL AFTER `plan_quote_image_ids`;
