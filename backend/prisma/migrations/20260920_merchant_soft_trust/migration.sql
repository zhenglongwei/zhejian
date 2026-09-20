-- Soft trust merchant fields (M-SOFT-02)
ALTER TABLE `merchants`
  ADD COLUMN `account_type` VARCHAR(16) NOT NULL DEFAULT 'merchant',
  ADD COLUMN `auth_status` VARCHAR(16) NOT NULL DEFAULT 'none',
  ADD COLUMN `profile_completeness` VARCHAR(16) NOT NULL DEFAULT 'basic',
  ADD COLUMN `legal_id_photo_url` VARCHAR(512) NOT NULL DEFAULT '',
  ADD COLUMN `auth_verified_at` DATETIME(3) NULL;

CREATE INDEX `merchants_auth_status_idx` ON `merchants`(`auth_status`);
