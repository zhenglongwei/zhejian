ALTER TABLE `users` ADD COLUMN `phone_changed_at` DATETIME NULL;
ALTER TABLE `users` ADD COLUMN `phone_change_count` INT NOT NULL DEFAULT 0;
