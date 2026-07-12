-- PV-REFORM · album_images 公开池分流字段
ALTER TABLE `album_images`
  ADD COLUMN `visibility` VARCHAR(16) NOT NULL DEFAULT 'private',
  ADD COLUMN `public_gate_status` VARCHAR(16) NOT NULL DEFAULT 'pending',
  ADD COLUMN `public_gate_reason` VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN `public_gate_checked_at` DATETIME(3) NULL;

CREATE INDEX `album_images_album_visibility_idx` ON `album_images` (`album_id`, `visibility`, `public_gate_status`);
