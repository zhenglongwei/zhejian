# Skill: 功能交付四步（需求 → 拆分 → 写码 → 验证）

> Agent 入口：`.cursor/skills/feature-build-verify/SKILL.md`  
> 配套：`.cursor/rules/communication-first.mdc` · `docs-before-code.mdc`

## 目标

非 trivial 开发严格按：**需求对齐 → 数据结构/对象边界 → 拆分可验收项 → 按项写代码 → 逐项验证**；禁止一口气堆完再凭感觉宣称做完。

**写码前硬门槛**：流程、节点、图片、报告、大模型返回的形状与读写路径未想清，不准进入拆分与写码（见 `object-model-first`）。

## 使用场景

- 新功能、流程/状态机/双端展示变更
- 用户要求「按流程做」「拆分功能」「写完要验证」
- 跨步链路（增项、确认、共享草稿、打码/识图/归组、本单图库）易回归场景

## 必读

1. `.cursor/skills/feature-build-verify/SKILL.md`（完整步骤与反模式）
2. 数据结构 / 对象边界 / LLM 外形：[`skill_object_model_first.md`](./skill_object_model_first.md)
3. 涉及口径时：对应 `docs/` 真源；增项点测见 [`../04_维修过程相册/27_DOC-FLOW增项最小验收清单.md`](../04_维修过程相册/27_DOC-FLOW增项最小验收清单.md)

## 输出

- 动手前：需求理解 + **数据结构怎么定** + 拆分表 + 本轮先做哪几项
- 每项后：改动摘要 + 验证结果（过 / 待点验 + 路径）
- 全部交付：勿声称未验证项已完成

## 自检

- [ ] 需求已对齐（或用户授权直接改）
- [ ] 已走 `object-model-first`（业务对象五问 + 适用时的读写路径 / LLM 外形），口径已进文档
- [ ] 有可勾选验收点，不是纯文件列表
- [ ] 改行为则文档已先更新
- [ ] 每项有验证记录；点测路径已写清
- [ ] 跨步不变量已做入口搜索（`invariant-close-loop`）；同一投诉不当新方案
