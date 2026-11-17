# 清理单据 payload 与 photoDraft（实施方案）

> 状态：生效
> 生效：2026-11-17
> 适用：`album.contentPackageJson.flowNodes[]` 节点内容袋、`document.payload`、`node.photoDraft`

## 1. 变更

- 旧口径：一个节点的业务内容可落在 `node.content`、`node.photoDraft`、`node.document.payload` 三处，读取按 `content → photoDraft → payload` 依次回退。
- 新口径：**节点业务内容只存 `node.content`**。`node.photoDraft` 与 `node.document.payload` 作为「内容袋」彻底移除；`document` 信封（`docType/status/confirmedAt/confirmedBy/proxyProofImages/sourceNodeIds/contentFingerprint/renderDoc/revisions`）保留不动。

本次只出方案，**不改代码**。

## 2. 影响

| 层 | 影响 |
| --- | --- |
| 字段 | `flowNodes[].photoDraft` 删除；`flowNodes[].document.payload` 删除；`document` 其余字段不变 |
| 接口 | `mapFlowNodeForView` 不再返回 `photoDraft` 别名（`content` 保留） |
| 客户端 | 商家端流程页 112 处 `photoDraft` 变量名/字段名需改名，保存请求不再带别名 |
| 文档 | `docs/04_维修过程相册/26_*`、`docs/11_数据结构与状态机/02_核心数据对象.md` 中三袋并存描述作废，见本文「取代」 |
| 代码 | 共享读取层、写入层、AI 分析、公开案例、图片权限、迁移脚本，约 30 个生产文件 |

## 3. 存量盘点（2026-11-17 只读实测）

只统计，未改数据。脚本为一次性只读查询，已跑完即弃。

| 指标 | 预发 | 生产 |
| --- | --- | --- |
| 相册 / 流程节点 | 17 / 129 | 7 / 49 |
| 节点有 `content` | 128 | 49 |
| 节点有 `photoDraft` | 2 | 0 |
| 节点 `document.payload` 非空 | 2 | 7（全部是 `confirmed` 单据） |
| **content 为空、只能靠旧字段取内容** | **1** | **0** |
| 只靠旧字段的节点 | `quote_confirm`（增项）：只有 `payload.lines` + `payload.discovery` | — |
| `confirmed` 单据中 payload 非空 | 0 | 7 |
| `document.revisions[].payload` 非空 | 0 | 0 |
| 归档快照 相册 / 节点 | 2 / 17 | 3 / 21 |
| 快照节点有 `content` | 0 | 0 |
| 快照节点只能靠旧字段取内容 | 0 | 3 |

关键结论：

1. **删字段不会让业务内容凭空消失**：生产 0 个节点依赖旧字段；预发仅 1 个增项报价节点，是报价解锁 heal 只写 `payload.lines` 造成的，折叠即可。
2. **归档快照里 `content` 全为空**（新旧快照都如此），公网案例目前靠 `resolveFactsFlowNodes` 按节点 id 从相册当前 `flowNodes` 回填。删 `payload` 读取前后都必须保留这条回填，或在 P3 重生成快照。
3. **新数据仍在写旧字段**：`wechat-archive-flow` 的 `applyDraftToNodes` 给新相册写 `photoDraft`/`document.payload`，属于「每天都在产生新存量」，必须优先改。

## 4. 实施阶段

各阶段独立可上线、可回滚。P1/P2 不改数据结构，建议先做。

### P0 存量盘点（已完成）

本文第 3 节。

### P1 修掉「只读旧字段」的消费方（当前就是 bug）

这些地方不接受 `content` 回退，content-only 案例会静默丢内容。统一改为 `contentOfFlowNode(node)`。

| 文件 | 位置 | 现状 |
| --- | --- | --- |
| `backend/src/services/node-ai-review.service.js` | L103、194、201、203、243、963、1039、1078 | 只读 `document.payload` 取 findings / lines / acceptanceItems |
| `backend/src/utils/case-geo-factpack.js` | L33-42 | `payloadOf` / `photoDraftOf` 无 content 回退 |
| `backend/src/utils/case-evidence-profile.js` | L26-33 | 同上，证据画像会判低 |
| `backend/src/services/service-flow.service.js` | L415、436-442 | 完工报告主诉只读 `inspectionReport.document.payload` |
| `backend/src/services/quote-assist.service.js` | L130-132、423 | 方案 AI 原料只读 payload |
| `backend/src/services/intake-advice.service.js` | L45 | 接车建议只读 payload |
| `backend/src/services/public-case.service.js` | L570 | 公开案例报告字段只读 payload |
| `backend/src/utils/host-public-content-check.js` | L50、89、102 | 托管校验只读 payload |
| `backend/src/services/content.service.js` | L327-331 | `flowContentBag` 仍读 payload，P4 前收窄为 content |

验证：为每个函数补一条「只有 content、payload 为空」的用例；现有 `case-geo-factpack.test.js`、`case-evidence-profile.test.js`、`node-ai-review` 相关测试补同一场景。

### P2 写入统一为 content（先双写，后单写）

| 文件 | 位置 | 改动 |
| --- | --- | --- |
| `backend/src/services/wechat-archive-flow.service.js` | L271-324 | `applyDraftToNodes` 改为写 `content`（接车/施工/交车/报价各分支） |
| `backend/src/services/service-flow.service.js` | L1308-1327 | 报价解锁 heal 由写 `document.payload` 改为写 `content` |
| `backend/src/utils/flow-photo-mask-writeback.js` | L284-300 | 打码回写由三写改为只写 `content` |
| `backend/src/services/case-hosting.service.js` | L136-150 | 归档冻结 `photoDraft` / `document.payload` 改为只冻结 `content`（P4 再落） |

`saved` 后仍保留 `envelopeOnlyDocument`（`payload: {}`），P4 再删字段。

验证：新建一条微信归档相册，确认新节点只有 `content` 有值，页面/AI/公网均正常。

### P3 存量折叠 + 归档快照

1. `DRY_RUN=1 node scripts/migrate-flow-content-once.cjs` → 确认 `changed` 数量与第 3 节一致（预发 1、生产 0）。
2. 正式跑，修掉预发那 1 个 `quote_confirm`。
3. 跑完再执行一次只读盘点，要求 `content 为空但旧字段有内容 = 0`。
4. 归档快照：**已定走「实时回填」**。保留并强化 `resolveFactsFlowNodes`（`backend/src/services/content.service.js` L337-353）：快照节点 `content` 为空时按节点 id 从相册当前 `flowNodes` 回填，不重生成已托管快照。P4 把 `flowContentBag` 收窄为只读 `content` 后，这条回填仍必须生效。

### P4 删字段（破坏性，需单独发版）

| 文件 | 改动 |
| --- | --- |
| `utils/service-flow-docs.js` + `backend/vendor/shared/utils/service-flow-docs.js` | `pickContentSource` 只取 `node.content`；删 `draftOfFlowNode`、`preserveGeneratedReportFields` 的 payload 入参；删 `normalizePhotoDraft`、`mergePhotoDraft` |
| `backend/vendor/shared/constants/service-flow-nodes.js` | `emptyDocument()` 去掉 `payload: {}`；删 `emptyPhotoDraft()` |
| `backend/src/services/service-flow.service.js` | `writeNodeContent` 去掉 `patch.photoDraft` 分支与 `delete next.photoDraft`；删 `projectDocumentPayloadFromContent`（死代码）与 `nodeNeedsLegacyFold` / `migrateFlowPackageOnce`；`mapFlowNodeForView` 删 `photoDraft` 键 |
| 图片引用收集 | `flow-public-media.js` L64-67/L98-100/L123-130、`public-service-flow.js` L129-130、`hosted-public-mask.service.js` L40-41、`album-media-library.service.js` L52、`album-social-card.service.js` L48 |
| 客户端 | `packageMerchant/pages/album/flow/index.js`：`nodeContentOf`、`applyNodeContent`、`flowContentSave`、`readLocalFlowDraft` 去掉 `photoDraft`；全文变量名改名 |
| 脚本 | `backend/scripts/migrate-flow-content-once.cjs` 保留到 P3 完成后再删 |

前置：**已定不留旧版小程序兼容**。P4 与小程序新版本同批上线：旧版读不到 `photoDraft` 即视为失效，不再返回该别名，也不接受旧写入回退。数据库已备份。

## 5. 不删清单

- `document` 信封字段与 `document.renderDoc`：已发报告正文靠它冻结，与 `payload` 无关。
- `document.revisions[]` 结构：只删其中的 `payload` 键，`renderDoc` 保留。
- 历史已发报告若要求原样不可变，靠 `renderDoc` 保证，不靠 `payload`。

## 6. 取代

- `docs/04_维修过程相册/26_商家端事件节点与单据节点链流程.md` 中「photoDraft / document.payload 作为内容载体」的章节：P4 合入时标注「已废止，见本文」。
- `docs/11_数据结构与状态机/02_核心数据对象.md` 中三袋并存的字段说明：同上。

## 7. 回滚

| 阶段 | 回滚方式 |
| --- | --- |
| P1 / P2 | 代码回滚即可，数据结构未变 |
| P3 | 迁移前备份 `album.content_package_json`；迁移脚本只做合并，可从备份还原 |
| P4 | 需回滚代码 + 用 P3 前备份恢复 JSON 列；旧版小程序按已定口径不再兼容，回滚期间需同步回退小程序版本 |

## 8. 已定决策（2026-11-17）

1. **归档快照走实时回填**：不重生成已托管快照，靠 `resolveFactsFlowNodes` 按节点 id 从相册当前 `flowNodes` 补 `content`。
2. **旧版小程序不留 `photoDraft` 兼容**：P4 直接停止返回别名、停止接受旧写入；旧版视为失效，需与小程序新版本同批上线。
