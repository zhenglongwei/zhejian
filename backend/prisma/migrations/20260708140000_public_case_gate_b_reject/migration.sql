-- CASE-GATE-B-02 · 结构化驳回原因（用户可读）
ALTER TABLE `public_cases`
  ADD COLUMN `gate_b_reject_type` VARCHAR(32) NOT NULL DEFAULT '',
  ADD COLUMN `gate_b_reject_reason` TEXT NOT NULL;
