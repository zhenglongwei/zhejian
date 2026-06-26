-- 用户账号状态（注销）
ALTER TABLE `users`
  ADD COLUMN `status` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' AFTER `phone`,
  ADD COLUMN `cancelled_at` DATETIME(3) NULL AFTER `status`;

CREATE INDEX `users_status_idx` ON `users`(`status`);
