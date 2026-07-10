-- AlterTable
ALTER TABLE `merchant_subscriptions` ADD COLUMN `standard_trial_used` BOOLEAN NOT NULL DEFAULT false;

-- 存量付费/公域商家视为已使用试用
UPDATE `merchant_subscriptions`
SET `standard_trial_used` = true
WHERE `plan` IN ('index_99', 'optimize_299');

-- 曾开通过标准版（含 0 元试用单）的商家
UPDATE `merchant_subscriptions` ms
INNER JOIN (
  SELECT DISTINCT merchant_id
  FROM merchant_payment_orders
  WHERE plan = 'index_99' AND status = 'paid'
) o ON o.merchant_id = ms.merchant_id
SET ms.standard_trial_used = true;
