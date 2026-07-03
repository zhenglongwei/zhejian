-- 完工节点 · 逐行前后对比（维修前可选）
ALTER TABLE `album_nodes` ADD COLUMN `compare_pair_rows` JSON NOT NULL DEFAULT ('[]');
