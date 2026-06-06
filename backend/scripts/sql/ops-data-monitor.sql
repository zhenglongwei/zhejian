-- OPS-DATA-03 · 埋点与日聚合手工巡检 SQL
-- 将 @target_date 改为上海日历「昨日」，例如 '2026-06-06'

SET @target_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY);
SET @day_start = CONCAT(@target_date, ' 00:00:00');
SET @day_end = CONCAT(DATE_ADD(@target_date, INTERVAL 1 DAY), ' 00:00:00');

-- 1) 昨日埋点总量（按事件名）
SELECT event_name, COUNT(*) AS cnt
FROM event_tracking_log
WHERE created_at >= @day_start AND created_at < @day_end
GROUP BY event_name
ORDER BY cnt DESC;

-- 2) 昨日 H5 相关埋点小计
SELECT COUNT(*) AS h5_events_yesterday
FROM event_tracking_log
WHERE created_at >= @day_start AND created_at < @day_end
  AND event_name IN (
    'h5_page_view', 'h5_case_view', 'h5_store_view',
    'h5_service_view', 'h5_call_click', 'h5_consult_click'
  );

-- 3) 日汇总表是否写入
SELECT store_id,
       store_view_count,
       service_view_count,
       case_view_count,
       phone_click_count,
       lead_submit_count
FROM merchant_daily_stats
WHERE stat_date = @target_date
ORDER BY case_view_count DESC, store_view_count DESC;

-- 4) 有埋点但日表无行的门店（storeId 在 event_params 中）
SELECT JSON_UNQUOTE(JSON_EXTRACT(event_params, '$.storeId')) AS store_id,
       COUNT(*) AS events
FROM event_tracking_log
WHERE created_at >= @day_start AND created_at < @day_end
  AND JSON_UNQUOTE(JSON_EXTRACT(event_params, '$.storeId')) IS NOT NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(event_params, '$.storeId')) != ''
GROUP BY store_id
HAVING store_id NOT IN (
  SELECT store_id FROM merchant_daily_stats WHERE stat_date = @target_date
);
