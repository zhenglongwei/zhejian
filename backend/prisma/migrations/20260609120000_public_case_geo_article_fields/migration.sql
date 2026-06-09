-- DS-B-01：public_cases 扩展 GEO / 案例文章字段（物理真源，见 docs/11_数据结构与状态机/06_案例文章与GEO字段映射.md）

ALTER TABLE `public_cases`
  ADD COLUMN `slug` VARCHAR(255) NULL AFTER `published_at`,
  ADD COLUMN `seo_title` VARCHAR(160) NOT NULL DEFAULT '' AFTER `slug`,
  ADD COLUMN `seo_description` VARCHAR(300) NOT NULL DEFAULT '' AFTER `seo_title`,
  ADD COLUMN `ai_summary` TEXT NOT NULL AFTER `seo_description`,
  ADD COLUMN `article_body` TEXT NOT NULL AFTER `ai_summary`,
  ADD COLUMN `article_status` VARCHAR(32) NOT NULL DEFAULT 'pending' AFTER `article_body`,
  ADD COLUMN `article_version` INT NOT NULL DEFAULT 0 AFTER `article_status`,
  ADD COLUMN `article_generated_at` DATETIME(3) NULL AFTER `article_version`,
  ADD COLUMN `seo_noindex` TINYINT(1) NOT NULL DEFAULT 0 AFTER `article_generated_at`,
  ADD COLUMN `canonical_path` VARCHAR(512) NOT NULL DEFAULT '' AFTER `seo_noindex`;

CREATE UNIQUE INDEX `public_cases_slug_key` ON `public_cases`(`slug`);
CREATE INDEX `public_cases_article_status_idx` ON `public_cases`(`article_status`);
