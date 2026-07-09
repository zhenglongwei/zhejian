-- CASE-MCH-03 · 商家授权前内容优化草稿（不写 public_cases）
ALTER TABLE `albums`
  ADD COLUMN `content_optimize_draft_json` JSON NULL;
