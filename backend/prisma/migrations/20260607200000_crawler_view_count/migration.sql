-- B-TRACK-04：商家日表增加爬虫访问代理指标

ALTER TABLE `merchant_daily_stats`
  ADD COLUMN `crawler_view_count` INT NOT NULL DEFAULT 0 AFTER `geo_view_count`;
