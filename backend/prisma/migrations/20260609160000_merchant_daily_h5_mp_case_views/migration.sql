-- DS-B-13 · 案例浏览拆分 H5 / 小程序
ALTER TABLE `merchant_daily_stats`
  ADD COLUMN `h5_case_view_count` INT NOT NULL DEFAULT 0 AFTER `case_view_count`,
  ADD COLUMN `mp_case_view_count` INT NOT NULL DEFAULT 0 AFTER `h5_case_view_count`;
