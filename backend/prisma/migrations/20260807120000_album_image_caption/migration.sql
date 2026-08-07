-- ALB-UX · 过程图备注（每图一段 caption）
ALTER TABLE `album_images`
  ADD COLUMN `caption` VARCHAR(500) NOT NULL DEFAULT '' AFTER `raw_url`;
