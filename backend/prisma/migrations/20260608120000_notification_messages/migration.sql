-- U-MINE-09 消息通知
CREATE TABLE `notification_messages` (
  `id` VARCHAR(191) NOT NULL,
  `receiver_type` VARCHAR(32) NOT NULL,
  `receiver_id` VARCHAR(191) NOT NULL,
  `message_type` VARCHAR(32) NOT NULL,
  `title` VARCHAR(191) NOT NULL DEFAULT '',
  `content` TEXT NOT NULL,
  `ref_type` VARCHAR(32) NOT NULL DEFAULT '',
  `ref_id` VARCHAR(191) NOT NULL DEFAULT '',
  `jump_path` VARCHAR(256) NOT NULL DEFAULT '',
  `channel` VARCHAR(32) NOT NULL DEFAULT 'in_app',
  `status` VARCHAR(32) NOT NULL DEFAULT 'sent',
  `read_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `notification_messages_receiver_type_receiver_id_read_at_idx`(`receiver_type`, `receiver_id`, `read_at`),
  INDEX `notification_messages_receiver_type_receiver_id_created_at_idx`(`receiver_type`, `receiver_id`, `created_at`),
  INDEX `notification_messages_ref_type_ref_id_message_type_idx`(`ref_type`, `ref_id`, `message_type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `notification_send_logs` (
  `id` VARCHAR(191) NOT NULL,
  `message_id` VARCHAR(191) NOT NULL,
  `channel` VARCHAR(32) NOT NULL DEFAULT 'wechat',
  `template_id` VARCHAR(191) NOT NULL DEFAULT '',
  `send_status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `fail_reason` VARCHAR(512) NOT NULL DEFAULT '',
  `retry_count` INTEGER NOT NULL DEFAULT 0,
  `sent_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `notification_send_logs_message_id_idx`(`message_id`),
  CONSTRAINT `notification_send_logs_message_id_fkey` FOREIGN KEY (`message_id`) REFERENCES `notification_messages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `notification_subscriptions` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `template_key` VARCHAR(32) NOT NULL,
  `template_id` VARCHAR(191) NOT NULL DEFAULT '',
  `status` VARCHAR(32) NOT NULL DEFAULT 'accept',
  `subscribed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `notification_subscriptions_user_id_template_key_key`(`user_id`, `template_key`),
  INDEX `notification_subscriptions_user_id_idx`(`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
