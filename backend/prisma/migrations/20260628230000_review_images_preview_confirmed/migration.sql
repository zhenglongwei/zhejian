ALTER TABLE `service_album_reviews`
  ADD COLUMN `images_preview_confirmed` BOOLEAN NOT NULL DEFAULT false AFTER `images_mask_status`;

UPDATE `service_album_reviews`
SET `images_preview_confirmed` = true
WHERE `images_mask_status` IN ('ready', 'partial')
  AND JSON_LENGTH(`images_json`) > 0;
