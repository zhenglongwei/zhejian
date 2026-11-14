# 任务清单：施工即验收 + 交车去验收

> 对应 spec：`.trae/specs/delivery-confirm-refactor/spec.md`
> 约束：后端/共用代码按 `.trae/rules/deploy.md` 本地改 → commit → `git push staging main` → 服务器 `npm install` / `npm run sync:shared-utils` / `pm2 restart zhejian-api-staging` → 健康检查。

## [x] T1 施工 AI：按验收标准判断完成度 + 说明润色

文件：`backend/src/services/step-advice.service.js`

1. `workInstruction(ctx)`（约 L1712）
   - 重写定位：施工节点唯一留证与验收节点；说明 + 图片即验收证据。
   - 加入第 5.2 节的一般验收标准表（按项目类型）。
   - 六步改为：
     1. 逐项完成判定：`证据:[{项目,判定:"已完成"|"待确认",依据,缺少}]`。
     2. 逐图归类（保持）。
     3. 拆分建议（保持）。
     4. 说明建议：`填写建议:[{项目,建议描述,修改建议}]`；空说明给 `建议描述`，已写说明给 `修改建议`（完整替换句）。
     5. 返工提醒（保持）。
     6. 新增项（保持）。
   - 删除「补拍清单」「证据充分/不足」「三类留证」主线；缺图只在 `缺少` 里写。
   - 保留「未施工交代」「禁止甩给交车」规则。
   - 更新末尾 JSON 示例。
2. `parseWorkAdvice(parsed, items, slots, options)`（约 L367–591）
   - `证据` 判定值解析：`已完成 → evidence:'done'`，`待确认 → evidence:'pending'`，兼容 `充分→done`、`不足→pending`。
   - 新字段 `completionBasis`（`依据`），`evidenceGap` 继续承接 `缺少`。
   - `填写建议` 读取 `修改建议` → `polish`；`建议描述` → `body`。
   - `补拍清单` 解析保留（老数据兼容），但新提示词不再产出。
   - `workItemsOut` 输出 `{ evidence, completionBasis, evidenceGap, advice:{ body, supplement, polish } }`。
   - 兜底 `photoPlan` 只在 `evidence === 'pending' && evidenceGap` 时生成，避免面板噪音。
3. `fingerprintFor`：`work_v8 → work_v9`。
4. `contextOf`：施工上下文无需新增字段；确认 `workItems` 已含 `note` 与 `photos`。

## [x] T2 施工节点 UI：施工说明 + 完成判定 + 润色

1. `packageMerchant/pages/album/flow/index.wxml`
   - 约 L988–1003：标签「说明」→「施工说明」；在 textarea 上方加一行提示「写清做了什么、怎么做的、结果如何；说明 + 图片即视为验收通过」。
   - 约 L2080–2122 工单项 AI 卡片：
     - 徽标沿用 `item.evidenceLabel`（值改为「已完成 / 待确认」）。
     - 新增「润色」按钮：`wx:elif="{{item.canPolish}}"`，同样调用 `onApplyWorkItemAdvice`，文案「润色」。
     - `item.polish` 展示为「润色建议：…」。
2. `packageMerchant/pages/album/flow/index.js`
   - `decorateWorkAdvice`（约 L6328–6362）：
     - `evidenceLabel`：`done→已完成`、`pending→待确认`、老 `sufficient→已完成`、老 `insufficient→待确认`、其余 `待确认`。
     - 输出 `completionBasis`、`polish`、`canPolish = Boolean(polish && written && polish !== written)`。
     - `canApply` 仍为「无说明且 body 存在」。
   - `onApplyWorkItemAdvice`（约 L8614）：`polish` 优先且替换 `caption`；否则保留原「应用/补充」逻辑（补充仅兼容老数据）。
3. `utils/service-flow-placeholders.js`（可选微调）
   - `workCaption` 示例保持按类目；不改结构。

## [x] T3 交车页：删除逐项验收，仅保留外观照

1. `packageMerchant/pages/album/flow/index.wxml`
   - 约 L1203–1272：
     - 标题「交付验收」+「（施工节点已留证，这里只读确认）」→「交车外观照（选填）」+ 提示「整车外观留档，无图可豁免」。
     - 逐项行循环加 `wx:if="{{item.kind === 'exterior'}}"`，只渲染外观行。
     - 删除 `acceptanceWorkCount` 空态提示与「施工节点未留证」相关文案。
     - 保留外观图预览/上传/删除事件。
2. `packageMerchant/pages/album/flow/index.js`
   - 保留 `acceptanceItems` 数据（外观行 + 老数据），删除/停用 `acceptanceWorkCount`（wxml 不再引用）。
   - `onOpenDeliveryIssue` 的返工选项继续用 `acceptanceItems`（施工项），不改。
3. 交车 AI 面板：
   - `index.wxml` `deliveryAdvicePanel`（约 L97）：删除「验收建议」与「图片挪行建议」两块，保留「质保期限建议」与 tips。
   - `index.js` `decorateDeliveryAdvice`（约 L6647–6730）：不再 map `raw.acceptance` / `raw.groups`，输出 `acceptance:null`、`groups:[]`、`splitGroups:[]`。
   - `onApplyDeliveryAdvice`（约 L5563）：仅保留 `kind === 'warranty'`；删除 acceptance/split 分支及 `applyDeliveryPhotoSplit` 调用入口。

## [x] T4 交车 AI 提示词减法

文件：`backend/src/services/step-advice.service.js`

1. `deliveryInstruction(ctx)`（约 L1914）：
   - 删除「验收」「拆分建议」步骤与示例；只保留：质保期限建议、提醒、简述、问答、图说。
   - `safeFacts` 去掉 `acceptance`，保留 `workItems`（含说明/图数）、`warranty*`、`delivery*`。
   - 简述第③点改为「修完怎么确认的（施工说明与照片）」。
2. `parseDeliveryAdvice`（约 L640–767）：
   - `acceptance` 恒为 `null`，`groups` 恒为 `[]`；删除 `accItems` 与 `splitGroups` 解析。
   - 保留 `repairBrief`、`ownerFaqs`、`warranty`、`tips`、`publicCaptions`、`imageNotes`。
3. `adviceHasContent('delivery')`（约 L794）：去掉 acceptance/groups 判断，保留 warranty/repairBrief/ownerFaqs/tips。
4. `fingerprintFor`：交车 `delivery_v7 → delivery_v8`，指纹内移除 `acceptance`。

## [x] T5 报告：移除验收章节

文件：`utils/owner-preview-doc.js`

1. 约 L336–372：删除 `acceptanceItems` 组装与写入 `repair_report` doc 的逻辑。
2. 确认报告渲染端（商家预览 / 车主页）对 `acceptanceItems` 有 `wx:if` 或空数组兜底；历史 payload 里的旧数据不再展示。
3. `utils/service-flow-docs.js` `buildRepairReportPayload`：如仍输出 `acceptanceItems`，删除该字段；`workItems` 说明与图片保持。

## [x] T6 校验

1. `node --check backend/src/services/step-advice.service.js`
2. `node --check packageMerchant/pages/album/flow/index.js`
3. `node --check utils/owner-preview-doc.js`
4. `node --check utils/service-flow-docs.js`
5. `node --test "utils/*.test.js"`（已知 3 个与 merchant-album-overview / merchant-stage-board 的失败为既有问题，不新增失败）
6. 若存在 step-advice 相关测试，同步更新并通过。

## [x] T7 部署（预发）

1. 本地 `git status --short` / `git diff` 复核，只提交本次相关文件。
2. `git commit` → `git push staging main`。
3. 服务器：`cd /var/www/zhejian-staging/backend && npm install && npm run sync:shared-utils && pm2 restart zhejian-api-staging`。
4. `curl -s https://staging.zhejian.simplewin.cn/api/v1/health`。
5. 待用户：小程序重新编译体验版，按 spec 第 7 节用例逐条验证。
6. 待用户确认：生产部署。
