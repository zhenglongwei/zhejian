-- PUB-RIGHT：商家发布 + 48h 异议窗口
ALTER TABLE `public_cases` ADD COLUMN `notify_window_ends_at` DATETIME(3) NULL;
ALTER TABLE `public_cases` ADD COLUMN `notify_sms_sent_at` DATETIME(3) NULL;
ALTER TABLE `public_cases` ADD COLUMN `owner_blocked_at` DATETIME(3) NULL;
ALTER TABLE `public_cases` ADD COLUMN `storefront_hidden` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `public_cases` ADD COLUMN `merchant_attested_at` DATETIME(3) NULL;
CREATE INDEX `public_cases_status_notify_window_ends_at_idx` ON `public_cases`(`status`, `notify_window_ends_at`);
