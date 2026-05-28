-- AlterTable: 微信登录 openid / unionid
ALTER TABLE `users` ADD COLUMN `openid` VARCHAR(128) NULL;
ALTER TABLE `users` ADD COLUMN `unionid` VARCHAR(128) NULL;

CREATE UNIQUE INDEX `users_openid_key` ON `users`(`openid`);
CREATE INDEX `users_unionid_idx` ON `users`(`unionid`);
