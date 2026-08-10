-- 卷十五：服务类目软清单
ALTER TABLE `albums` ADD COLUMN `checklist_json` JSON NULL;
ALTER TABLE `album_images` ADD COLUMN `checklist_item_key` VARCHAR(64) NOT NULL DEFAULT '';
