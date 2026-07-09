-- CASE-ENR-01 · 提炼层 enrichment_json 独立列（与 content_json.snapshot 分离）
ALTER TABLE `public_cases`
  ADD COLUMN `enrichment_json` JSON NULL,
  ADD COLUMN `enrichment_version` INT NOT NULL DEFAULT 0;

CREATE INDEX `public_cases_enrichment_version_idx` ON `public_cases`(`enrichment_version`);
