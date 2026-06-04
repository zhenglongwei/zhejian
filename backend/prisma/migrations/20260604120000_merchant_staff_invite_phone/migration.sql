-- 员工邀请：先登记手机号，用户登录并绑定该号后再关联 user_id
ALTER TABLE `merchant_staff`
  ADD COLUMN `invite_phone` VARCHAR(11) NOT NULL DEFAULT '' AFTER `user_id`;

ALTER TABLE `merchant_staff` DROP FOREIGN KEY `merchant_staff_user_id_fkey`;

ALTER TABLE `merchant_staff` MODIFY `user_id` VARCHAR(191) NULL;

ALTER TABLE `merchant_staff`
  ADD CONSTRAINT `merchant_staff_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX `merchant_staff_merchant_id_invite_phone_key`
  ON `merchant_staff`(`merchant_id`, `invite_phone`);
