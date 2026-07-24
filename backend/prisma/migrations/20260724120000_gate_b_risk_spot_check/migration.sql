-- CASE-OPS-GATEB-RISK · 闸门 B 风险分流与抽检标记
ALTER TABLE `public_cases`
  ADD COLUMN `gate_b_risk` VARCHAR(16) NOT NULL DEFAULT '',
  ADD COLUMN `spot_check_status` VARCHAR(32) NOT NULL DEFAULT '';

CREATE INDEX `public_cases_gate_b_risk_idx` ON `public_cases`(`gate_b_risk`);
CREATE INDEX `public_cases_spot_check_status_idx` ON `public_cases`(`spot_check_status`);
