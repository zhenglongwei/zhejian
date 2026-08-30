-- GEO 评分分口径：把「被 AI 主动提到」和「被搜到时呈现什么样」拆成两个独立分数。
--
-- 背景：搜索引擎和大模型网页版测的是两件事，混成一个总分会让榜单排不出名次，
-- 也会让读者误以为「能搜到」等于「AI 会推荐你」。门店会拿榜单去 AI 那里求证，
-- 对不上就是信誉事故，所以两块必须分开存、分开展示。

ALTER TABLE `geo_check_score`
  ADD COLUMN `visibility_score` INT NULL COMMENT '可见性分 0-100，大模型平台（不带店名的业务题）。NULL=本轮未测' AFTER `coverage_rate`,
  ADD COLUMN `foundation_score` INT NULL COMMENT '地基承接分 0-100，搜索引擎（带店名的查询）。NULL=本轮未测' AFTER `visibility_score`,
  ADD COLUMN `measured_scope` VARCHAR(16) NOT NULL DEFAULT 'none' COMMENT 'both/visibility/foundation/none：本轮实际测到哪一块' AFTER `foundation_score`;
