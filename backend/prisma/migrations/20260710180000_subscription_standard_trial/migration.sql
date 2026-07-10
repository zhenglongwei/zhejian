-- AlterTable
ALTER TABLE `merchant_subscriptions` ADD COLUMN `standard_trial_used` BOOLEAN NOT NULL DEFAULT false;

-- 存量付费/公域商家视为已使用试用
UPDATE `merchant_subscriptions`
SET `standard_trial_used` = true
WHERE `plan` IN ('index_99', 'optimize_299');
