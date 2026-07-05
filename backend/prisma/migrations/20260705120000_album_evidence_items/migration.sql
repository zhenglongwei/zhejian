-- B-EVID-01: 结构化 evidenceItems（单据分槽）
ALTER TABLE `albums` ADD COLUMN `evidence_items_json` JSON NOT NULL DEFAULT ('[]');
