# Skill: Case Snapshot Flow（卷九 · 案例全流程主编排）

## 目标

在 **小程序 → 运营后台 → 公开网站 → GEO 提炼** 全链路开发前，统一产品原则、任务分流与验收顺序，避免快照/提炼层混写、跨端口径不一致。

## 使用场景

- 启动卷九任意 `CASE-*` 任务前
- 用户描述「案例全流程 / 快照 / 公示后不可改 / GEO 提炼」
- 跨 `backend/`、`admin-web/`、`h5/`、`packageMerchant/`、`pages/album/` 的联动改造

## 真源文档（开发前必读）

| 文档 | 用途 |
| --- | --- |
| [`13_案例全流程快照与GEO分层开发计划.md`](../04_维修过程相册/13_案例全流程快照与GEO分层开发计划.md) | 任务 ID、阶段、权限矩阵 |
| [`00_Phase1_服务相册产品口径.md`](../04_维修过程相册/00_Phase1_服务相册产品口径.md) | 角色分工 |
| [`03_服务相册流程.md`](../04_维修过程相册/03_服务相册流程.md) | 授权/撤回 |
| [`07_案例生成规则.md`](../04_维修过程相册/07_案例生成规则.md) | 成稿字段 |
| [`04_公开案例审核.md`](../06_平台运营后台/04_公开案例审核.md) | 合规-only 审核 |
| [`docs/00_开发计划.md`](../00_开发计划.md) 卷九索引 | 进度勾选 |

## 产品原则（不可违反）

1. **商家**制造留档；**用户**决定公示/撤回；**平台**只做合法合规。
2. **用户首次授权** → 相册锁定 + **CaseSnapshot** 整包冻结（含当时 title/body/nodes）。
3. **公示后快照一字不改**；FAQ/GEO/SEO/专题/聚合 FAQ 属 **GeoEnrichmentLayer**，可随时改。
4. **再授权** → 强制重审 + `snapshotVersion++`。
5. **驳回/要求修改**且用户未撤回 → 相册**保持锁定**；须用户撤回后商家才可改相册。
6. **299 润色**仅商家在授权前发起；平台不在公示后替商家改快照。

## 子 Skill 矩阵

| 任务前缀 / 目录 | 使用 skill |
| --- | --- |
| `CASE-SNAP-*`、`public-case.service`、`service-album.service`、`content.service` 读侧 | **`case-snapshot-engine`** |
| `CASE-ENR-*`、`geo-case-aggregate`、`geo-page-generator`、`h5-geo-topic`、`public-feed` | **`case-enrichment-geo`** |
| `CASE-OPS-*`、`admin-web/.../case-review` | **`ops-admin-scaffold`** + **`case-snapshot-engine`** |
| `CASE-MCH-*`、`packageMerchant/pages/album/` | **`merchant-workbench-scaffold`** + **`case-snapshot-engine`** |
| 用户授权/撤回 UI | **`api-integration`** + **`privacy-desensitization-check`** |
| H5 案例页 | **`case-enrichment-geo`** + **`privacy-desensitization-check`** |
| 合并前 / 发版前 | **`case-snapshot-check`** → **`release-checklist`** |

## 推荐执行顺序

```text
1. 读本 skill + 13_计划文档
2. 若动 PRD/口径 → CASE-DOC-* 先改文档
3. case-snapshot-engine（B 阶段 P0）
4. ops-admin-scaffold 收口（C 阶段）
5. case-enrichment-geo（D 阶段，可与 IGAIN 衔接）
6. case-snapshot-check + release-checklist
```

## 实现前输出格式（须先给用户确认）

```markdown
# 卷九实现计划 · [任务 ID]

## 需求理解
- 动快照 / 动提炼层 / 两者
- 冻结时机与版本策略

## 涉及文件
- backend: …
- admin-web / h5 / 小程序: …

## 边界
- CaseSnapshot 字段：…
- GeoEnrichment 字段：…
- 明确不改：…

## 子 skill
- case-snapshot-engine / case-enrichment-geo / …

## 验收
- CASE-FLOW / smoke 脚本
- case-snapshot-check 要点
```

## 约束

- 与 [`privacy-desensitization-check`](./skill_privacy_desensitization_check.md) 冲突时：**快照只含脱敏 URL**。
- 与 [`ops-admin-scaffold`](./skill_ops_admin_scaffold.md) 冲突时：**运营不改快照，只改 enrichment + 合规动作**。
- 进度勾选只写 [`00_开发计划.md`](../00_开发计划.md) 与 `13_` 计划文档。
