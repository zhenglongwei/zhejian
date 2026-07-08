-- CASE-GATE-A-01 · 相册完工合规闸门
ALTER TABLE `albums`
  ADD COLUMN `compliance_status` VARCHAR(32) NOT NULL DEFAULT '',
  ADD COLUMN `compliance_passed_at` DATETIME(3) NULL,
  ADD COLUMN `compliance_reject_reason` TEXT NOT NULL,
  ADD COLUMN `compliance_review_mode` VARCHAR(32) NOT NULL DEFAULT '',
  ADD COLUMN `compliance_checked_at` DATETIME(3) NULL;

CREATE INDEX `albums_compliance_status_idx` ON `albums`(`compliance_status`);
