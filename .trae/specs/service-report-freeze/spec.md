# 服务相册报告冻结与流程修复 Spec

## 1. 目标

修复测试反馈的 8 个问题，并把「节点内容 → 只读报告 → 车主端」的链路收敛为一条：

- 节点 content 是唯一源头；
- 商家/车主看到的报告在发送（完成）时生成一次并冻结为 `document.renderDoc`；
- 车主端只读快照，不再从节点重新拼装；
- 冻结后不可原地修改，只能从预览页点「返回修改 / 返回施工」回到可编辑态，重新确认生成新版本，旧版本进 `document.revisions[]`。

## 2. 已确认的产品边界

1. `repairBrief`（修车简述）不进入交车报告，仅用于托管预览与公网展示（现状已如此，本次不改）。
2. 交车报告一旦交给车主即冻结。
3. 相册节点没有单独的「完成」按钮，**完成即发送**；`pending_confirm` 即已发送。
4. 版本差异只做如实记录，不做人工合并。
5. 相册详情页展示完整车辆信息（车牌、VIN、完整车型、品牌/车系/年款、底盘、发动机、排量、变速箱、接车里程），手机号仍打码。

## 3. 数据模型

`document.renderDoc`（顶层字段，与 `payload` 并列，避免被 `envelopeOnlyDocument` 清空）：

```js
{
  family: 'intake' | 'inspect' | 'quote' | 'finish',
  revision: 0,
  frozenAt: '2026-11-15T...',
  doc: { /* buildOwnerPreviewDoc / buildIntakePreviewFromContent 产出 */ },
  quoteLines: [],
  hasBody: true
}
```

- 生成：发送/完成时由后端统一生成。
- 回退：`renderDoc` 缺失时保留现有拼装逻辑（旧数据兼容）。
- 只读：`renderDoc` 存在且 `document.status !== 'draft'` 时，节点内容编辑接口拒绝原地改（走「返回修改」）。

### 3.1 版本归档规则（按反馈修正）

| 场景 | 处理 |
| --- | --- |
| 商家在预览报告页点「返回修改 / 返回施工」撤回 | **不归档、不产生新版本**：清空 `renderDoc` 与 payload，`revision` 不变，`revisions[]` 不变。 |
| 已发送给车主，车主点「不同意」→ 商家修改后重新发送 | **归档旧版本**：把被车主拒绝的那一版 `renderDoc` + payload 压入 `document.revisions[]`（保留最近 10 条），`revision + 1`。 |
| 报告已 `confirmed` 后因返工/复核重新生成 | **归档旧版本**（车主已确认过），`revision + 1`。 |
| 从未被车主查看过的 `pending_confirm` 被重新发送 | 不归档，直接覆盖。 |

判定依据（后端）：

```js
const shouldArchive =
  Boolean(String(doc.ownerRejectReason || '').trim() || String(doc.rejectedAt || '').trim()) ||
  Boolean(String(doc.confirmedAt || '').trim())
```

- `ownerRejectReason / rejectedAt`：车主不同意时写入，标记「这一版被车主看过且被拒」。
- `confirmedAt`：车主/代确认时间，标记「这一版车主已确认」。
- 两者都没有的 `pending_confirm`，视为商家自己撤回，不归档。

## 4. 改动清单

### A. 报告冻结

| 文件 | 改动 |
| --- | --- |
| `backend/src/services/service-flow.service.js` | 新增 `freezeNodeRenderDoc(node, album, allNodes)`：按 kind 调 `buildOwnerPreviewDoc` / `buildIntakePreviewFromContent`，写 `document.renderDoc`；仅在 3.1 条件满足时归档旧版。 |
| 同上 | 调用点：① 接车完成分支；② 检测完成→报告 `delivered`、报价 `pending_confirm`；③ `insertAddonPlan` 创建补充报价；④ 交车完成→`repair_report` `pending_confirm`。 |
| 同上 | `mapOwnerFlowDocCard`：存在 `doc.renderDoc.doc` 时以快照为基座，只覆盖动态字段（`id/kind/statusLabel/needsConfirm/cancelled/ownerRejectReason/cancelReason/signName/signAt`）。 |
| 同上 | `mapFlowNodeForView` 透传 `document.renderDoc` 给商家端。 |
| 同上 | 新增 `shouldArchiveRenderDoc(doc)` 判定（见 3.1）；撤回路径（`returnToEdit` / 预览页「返回修改」「返回施工」）清空 `renderDoc`，不写 `revisions[]`。 |
| 同上 | 车主拒绝路径写入 `ownerRejectReason` + `rejectedAt`，保留旧 `renderDoc` 直到下次发送时归档。 |
| `packageMerchant/pages/album/flow/index.js` | `reportPreviewFor(title)` 优先返回对应节点已冻结的 `renderDoc`；无快照时才本地组装。 |

### B. 里程

| 文件 | 改动 |
| --- | --- |
| `packageMerchant/pages/album/flow/index.js` | `buildPhotoDraftPayload()` 的 `intake` 分支写入 `mileageKm`（当前表单值）。 |
| 同上 | 接车页 `mileageKm` 改为 `photoDraft.mileageKm → data.mileageKm → album.vehicle.mileage`。 |
| 同上 | `deliveryMileage` 回退链删除「检测/接车节点里程」与 `album.mileage`，只认 `photoDraft.deliveryMileage`。 |
| `backend/vendor/shared/utils/owner-preview-doc.js` | `albumMetaLine` 在 `mileageText` 为空时用 `album.mileage` 兜底（接车报告）。finish 分支新增接车里程展示。 |
| `backend/vendor/shared/utils/service-flow-docs.js` | `buildRepairReportPayload` 增加 `mileageText`（交车里程）与 `intakeMileageText`。 |

交车报告 metaLine 输出形如：`接车里程 2,000 km · 交车里程 2,100 km`。

### C. 返工

| 文件 | 改动 |
| --- | --- |
| `backend/src/services/service-flow.service.js` | `reopenMerchantWorkForRework` 把 `reworkRecords` 写入**施工节点 content**（交车节点保留副本）；施工节点回 `in_progress`。 |
| `backend/vendor/shared/utils/owner-preview-doc.js` | finish 分支透出 `reworkRecords`。 |
| `components/service-doc-sheet/*` | 新增「返工记录」区块渲染（原因 / 项目 / 时间）。 |
| `packageMerchant/pages/album/flow/index.js` | 返工确认后 Toast 改为可停留 `wx.showModal`（说明去施工节点处理），确认后 `openStage('work')`。 |
| 同上 + `index.wxml` | 施工节点顶部展示「待返工 N 项」与原因列表；施工完成时回写 `doneAt`。 |

### D. 交车推进

| 文件 | 改动 |
| --- | --- |
| `packageMerchant/pages/album/flow/index.js` | `onConfirmPhotoStep` 在 `delivery_photos` 完成成功后 `await this.openStage('finish')`，进入交车报告只读态，避免因 `repair_report` 已 `pending_confirm` 导致按钮隐藏而卡在交车节点。 |

### E. 补充报价导航与标记

| 文件 | 改动 |
| --- | --- |
| `packageMerchant/pages/album/flow/index.wxml` | 底部栏新增「继续施工」（`isAddonQuote && stageLocked` 显示）；原「返回施工」改名「撤销补充报价」，仅 `!stageLocked` 显示。 |
| `packageMerchant/pages/album/flow/index.js` | 新增 `onContinueWork`：存在 `parentNodeId === 补充报价节点 id` 的补充施工节点则打开它，否则打开原施工节点。 |
| 同上 + `index.wxml` | 新增 `resolveItemQuoteState(finding, flowNodes)`：按 confirmed 报价行的 `quoteLineId` / `workFindingId` 判定，输出「已报价 / 补充报价中 / 补充报价」。替换现有只看 `outsideQuote` 的标记。 |

### F. 移除补充报价自动 AI

| 文件 | 改动 |
| --- | --- |
| `backend/src/services/service-flow.service.js` | 删除 `insertAddonPlan` 中 `queueQuoteAssistIfNeeded(..., { force: true })`。 |
| 同上 | 保存节点时的自动入队仅在 `forceAdviceRefresh`（用户点「AI 分析」）时执行。 |
| `packageMerchant/pages/album/flow/index.js` | 进入补充报价节点时，仅当节点已有 `quoteAssist` 结果才回填展示，不默认进入分析中状态。 |

### G. 未施工核对

| 文件 | 改动 |
| --- | --- |
| `utils/service-flow-docs.js` | `collectConfirmedQuoteLines` 保留 `workFindingId`。 |
| 同上 | `computeUnstartedQuoteItems` 优先按 id 双向匹配：`line.id === finding.quoteLineId` 或 `line.workFindingId === finding.id`；名称匹配只作兜底且要求唯一。 |
| 同上 | 有图片、或有 `caption/description` 的 finding 视为已施工，不进入未施工提醒。 |
| `packageMerchant/pages/album/flow/index.js` | 提醒保持非阻塞；仅当确实存在「无名无图」项时才弹「系统错误 / 客户不做」。 |

### H. 车辆信息展示

| 文件 | 改动 |
| --- | --- |
| `backend/src/services/service-album.service.js` | `normalizeVehicleJson` 保留 `modelName`。 |
| `utils/merchant-album-overview.js` | 新增 `vehicleFacts`（车牌 / VIN / 完整车型 / 品牌·车系·年款 / 底盘 / 发动机 / 排量 / 变速箱 / 接车里程）；`vehicleName` 优先 `modelName`。 |
| `packageMerchant/pages/album/flow/index.wxml` | 概览 hero 下渲染 `vehicleFacts` 信息卡；手机号继续用 `overview.meta` 的打码值。 |
| `components/merchant-create-sheet/index.js` | `applyDecodedFields` 回填并展示底盘 / 发动机 / 排量 / 变速箱。 |

### I. 选填颜色

| 文件 | 改动 |
| --- | --- |
| `packageMerchant/pages/album/flow/index.wxml` | 「（选填）」改用新 class `merchant-flow-page__key-fill-opt`。 |
| `packageMerchant/pages/album/flow/index.wxss` | 新增该 class，颜色用 `var(--color-text-tertiary)`（中性色）。 |

## 5. 不做的事

- 不给交车报告加 `repairBrief`。
- 不新增「完成」与「发送」两个按钮。
- 不引入报告在线编辑；冻结后只能走返回修改。
- 不改托管预览 / 公网展示的 `repairBrief` 用途。

## 6. 验证步骤

本地：

1. `cd backend && npm run sync:shared-utils`（共享文件改动后必须执行）。
2. 后端启动后按相册走完整链路，核对接口返回的 `document.renderDoc`。

预发（部署后逐条验收）：

1. 新建相册 → VIN 解析：底盘 / 发动机 / 排量 / 变速箱可回填并保存；详情页完整展示，手机号打码。
2. 接车完成 → 车主端接车报告显示接车里程；商家预览文案与车主端逐字一致。
3. 检测报告 / 报价发送 → 商家预览与车主端一致（同读 `renderDoc`）。
4. 补充报价：进入不自动跑 AI；确认后底部出现「继续施工」并回到施工节点；施工项标记变「已报价」。
5. 施工项有图有文案 → 完成施工不再弹未施工原因。
6. 交车：填交车里程 → 报告同时显示接车/交车里程；选返工 → 弹窗停留、跳到施工节点、报告含返工章节。
7. 点「完成交车」→ 自动进入交车报告只读态，可预览、可请车主确认。
8. 「（选填）」为中性色。
9. 版本规则：预览页点「返回修改」撤回后重发，`revisions[]` 不新增；车主点「不同意」→ 商家修改重发，`revisions[]` 新增一条且 `revision + 1`。

## 7. 风险与回退

- `renderDoc` 为新增字段，旧数据无该字段时走原拼装逻辑，可灰度。
- 冻结逻辑集中在后端 4 个发送点，若有遗漏，车主端会回退到原拼装（不会白屏）。
- 里程改动会影响交车必填校验，需确认历史相册仍能打开（缺失交车里程时只读展示为空，不阻断查看）。
