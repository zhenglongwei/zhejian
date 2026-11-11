# 施工节点 AI 分析重构 · 规格说明

状态：待用户批准（批准后才动代码）

## 1. 背景与目标

现有施工节点 AI 分析把「报价项」「施工项」「新增项」混在一起，出现三类坏情况：

1. 明明同一个项目，模型名称写法不同就匹配不上；
2. 明明不同项目，被错误合并；
3. 报价有、施工没做的项目，提醒埋没在泛泛建议里，店员看不到。

本次重构把施工 AI 分析收敛为六步，并把「报价项（车主确认定稿）」与「施工项（进施工节点按报价规则预设生成，允许差异）」严格分开：命名、UI、prompt、契约都分开。

## 2. 已确认口径（不可偏离）

- 图归类顺序：**先匹配工单项目 → 工单没有再匹配报价项 → 两者都没有才是新增**。
- 模型禁止自造项目名；只能从参考材料给出的「工单项目」「报价项」中原样选择，新增项才允许留空或写新名。
- 「报价有、工单无、但有图」= 工单漏记，独立处置为「建议补建工单项并带图」，**不算未施工**。
- 「报价有、工单无、且无图」= 未施工（缺失）；应用后建工单项但无图文。
- 完成施工提醒：只在点「完成施工」时弹，**非阻塞**，可继续；检查类（0 元或名称含检查/检测/排查/保压）也计入；不覆盖交车。
- 润色只补缺失信息（做了什么 / 换什么件 / 关键工序 / 结果），不改文采；已写描述只给「补充建议」，未写才给可应用文案。
- 检查类证据只看结论文字，不要求施工图。
- 状态矩阵：施工项 normal/new × sufficient/insufficient（4 种）+ 报价项 missing（1 种），共 5 种。
- 「补充报价」徽标持久化；手动清除或关联到报价项后自动清除。
- 旧字段 items / gaps / photoPlan / sequence / groups / newItems 继续产出，前端停用；指纹升 v2。

## 3. 数据事实（已核实）

- 报价行真源：`contentOfFlowNode(quoteNode).lines`，含 `id / name / amount / note`；确认后 `document.payload` 可能为空（`envelopeOnlyDocument` 会清空 payload）。
- 工单 finding：`contentOfFlowNode(workNode).findings`，含 `id / partName / caption / images / quoteLineId / outsideQuote`。
- 施工项预设来源：`seedWorkFindingsFromQuoteLines(findings, quoteLines)`，按报价行生成 `wf_*` 行并写入 `quoteLineId`。
- 现有指纹：`fingerprintFor('work')` 为 `{v:'owner-all', quoteLines, workItems, workPhotos}`。

## 4. 后端改动

### 4.1 `utils/service-flow-docs.js`

1. `collectConfirmedQuoteLines(flowNodes)`（约 L941）
   - 改为 content 优先：`contentOfFlowNode(node).lines` → 回退 `doc.payload.lines`。
   - 保留：仅 `quote_confirm` / `addon_quote_confirm`、排除 `status === 'cancelled'`、按 id/name 去重。
   - 目的：修复确认后 payload 被清空导致报价行读不到的问题，同时服务前端工单预填。
2. 新增 `normalizeItemName(value)`：`String(value||'').replace(/\s+/g,'').trim()`。
3. 新增 `resolvePresetItemName(rawName, presetNames)`：
   - 空 → `''`；
   - 精确（去空白后）命中 → 返回该预设原名；
   - 否则包含匹配（`raw ⊂ preset` 或 `preset ⊂ raw`，raw 去空白后长度 ≥ 2），多个命中取**最长**预设名；
   - 仍无 → `''`（调用方按「新增」处理）。
4. 新增 `computeUnstartedQuoteItems(flowNodes)`：
   - 报价行 = `collectConfirmedQuoteLines`；
   - 工单引用集合 = 所有 `work` 节点 findings 的 `quoteLineId` + `resolvePresetItemName(partName, 报价行名) `；
   - 未被引用的报价行 → `{ id, name, amount, note }`；
   - 返回 `{ items, total }`。
5. 全部导出（文件尾部 `module.exports`）。

### 4.2 `backend/src/services/step-advice.service.js`

1. `workRows(node)`：每行增加 `quoteLineId`（其余不变）。
2. `contextOf(album)`：新增 `quoteItemRows`（来自 `collectConfirmedQuoteLines(readFlowNodes(album))` 的 `{id,name,amount,note}`）；`workItems` 继续用 `workRows`（现含 quoteLineId）；`workPhotoSlots` 已有 `findingId`。
3. `workInstruction(ctx)` 重写为六步 prompt：
   - 材料：`报价项`（含「工单已有 / 工单无」标记）、`工单项目`、`图片`（图N 及当前挂载）、前序节点文字摘要。
   - 第 1 步「报价项建议」：逐报价项给 `做法` + `拍照建议`（只读）。
   - 第 2 步「逐图归类」：逐图给 `{图, 内容, 归属}`；`归属` 必须从「工单项目」「报价项」原样选择，或写「新增」。
   - 第 3 步「拆分建议」：同一工单项内混多个项目时给 `{项目, 图片, 描述}`；`项目` 同样只能取预设名。
   - 第 4 步「证据」：逐工单项给 `{项目, 证据:"充分"|"不足", 缺什么}`；检查类只看结论文字。
   - 第 5 步「填写建议」：未写描述给 `建议描述`；已写描述只给 `补充建议`。
   - 第 6 步「新增项」：工单和报价都没有的图才列，`{项目?, 图片, 描述}`。
   - 明确：同一项目不同叫法必须归到预设名（例：报价只有「划痕修复」时，底部划痕/门边划痕都归「划痕修复」）；不同项目不得合并。
   - 保留 `masks` 要求与 `MODEL_MASKS_INSTRUCTION`。
4. `parseWorkAdvice(raw, items, slots, options = {})`：
   - `options.quoteLines` 可省略（保持旧测试 3 参调用可用）。
   - 新增输出：
     - `workItems`: `[{ id, name, quoteLineId, quoteName, origin:'quote'|'extra', photos:[{slot,url}], written, evidence:'sufficient'|'insufficient'|'unknown', evidenceGap, advice:{body,supplement}, action:'fill'|'supplement'|'none' }]`
     - `quoteOnlyItems`: `[{ id, name, amount, note, kind:'unstarted'|'work_missing', photos:[{slot,url}], advice:{body}, action:'create', canApply:true }]`
     - `quoteAdvice`: `[{ id, name, how, photo }]`
     - `schema: 2`
   - 匹配规则：模型给的名称先 `resolvePresetItemName(名称, 工单名)`，再 `resolvePresetItemName(名称, 报价名)`；都对不上才进 `newItems`。
   - 旧字段继续产出：`sequence`（由 quoteAdvice 映射）、`items`（由 workItems 的 fill/supplement 映射旧结构）、`gaps`（unstarted→missing、新增→extra）、`photoPlan`（证据不足项）、`groups`（拆分）、`newItems`。
5. `adviceHasContent('work')` 纳入 `quoteAdvice / workItems / quoteOnlyItems`。
6. `fingerprintFor('work')`：`v: 'work_v2'`，`quoteLines` 带 `id`（旧结果自动判 stale 并重跑）。
7. `sanitizeStepAdviceForView('work')` 透出 `schema / quoteAdvice / workItems / quoteOnlyItems`。
8. `backend/src/services/step-advice.test.js` 增补：
   - 5 种状态（工单 normal/new × 充分/不足、报价项 missing）；
   - 两级归类（先工单、再报价、最后新增）；
   - 「划痕修复」归并、不同项目不合并；
   - 报价有工单无有图 → `work_missing`，不算未施工；
   - 检查类 0 元也计入未施工。

### 4.3 `backend/src/services/service-flow.service.js`

1. 顶部从 `resolveShared('utils/service-flow-docs.js')` 增引 `computeUnstartedQuoteItems`。
2. `completeFlowNode` 末尾（L1947-1960 返回处）：
   - `node.kind === 'work'` 时，用刷新后的 `readFlowNodesRaw(refreshed)` 计算；
   - 返回体增加
     `warnings: [{ code:'QUOTE_ITEMS_NOT_STARTED', total, items:[name…] }]`；
   - 无未施工项时不带 `warnings`。

## 5. 前端改动

文件：`packageMerchant/pages/album/flow/index.js`、`index.wxml`、必要时 `index.wxss`。

1. `decorateWorkAdvice(raw, sections)` 新增：
   - `quoteAdvice`：`{id,name,how,photo,hasHow,hasPhoto}`；
   - `workItems`：带 `evidenceLabel`（充分/不足/待核）、`evidenceGap`、`adviceBody`、`supplement`、`canApply`、`applyMode:'fill'|'supplement'`；
   - `quoteOnlyItems`：带 `unstarted`（kind==='unstarted'）、`missed`（kind==='work_missing'）、`photos`、`adviceBody`、`canApply`；
   - `hasQuoteAdvice / hasWorkItems / hasQuoteOnlyItems / showLegacy`（新数组全空时 showLegacy=true）。
   - `hasContent` 纳入新数组。
2. `index.wxml` 施工面板（现 L1916-L2043）：
   - 「施工建议（按报价项）」：quoteAdvice 卡片，只读（做法 / 拍照）。
   - 「工单项」：workItems 卡片；证据徽标 + 缺什么；未写描述给「应用」，已写给「补充」；沿用蓝色左边条可操作样式。
   - 「报价项待施工」：quoteOnlyItems 卡片；未施工 / 漏记徽标；按钮「新增」→ `onApplyWorkQuoteItem`。
   - 保留「新增项（施工中发现）」区块。
   - 旧区块（施工顺序、拍照建议、填写建议、拆分建议）仅 `workAdvice.showLegacy` 时渲染。
3. 新增/调整 handlers：
   - `onApplyWorkItemAdvice(e)`：`fill` → finding.caption = body；`supplement` → finding.caption = `${caption} ${supplement}`；落库与现有 `onApplyWorkExplain` 同路径。
   - `onApplyWorkQuoteItem(e)`：按 quoteOnlyItem 新建工单项（`partName=name`、`quoteLineId=id`、`images=photos`、`outsideQuote=false`），追加到施工区并持久化；不弹补充报价。
   - `onApplyWorkNewItem` 保持：新建后弹「是否补充报价」（非强制）。
4. 完成施工（`index.js` work 分支，约 L7449）：
   - `const unstarted = computeUnstartedQuoteItems(this._flowNodes || [])`（`_flowNodes` 为本页已缓存的 flowNodes；无则用 `this.data.flowNodes`）。
   - `items.length > 0` 时先 `wx.showModal`：
     - 标题「还有 N 项报价项目未施工」；
     - 正文列出前 4 项 + 「可回报价单查看，也可继续完成」；
     - `confirmText:'仍然完成'` → 继续原 `run()`；`cancelText:'去看看'` → `openStage('quote')`，不中断。
   - 若接口返回 `warnings` 含 `QUOTE_ITEMS_NOT_STARTED`，`loadFlow` 后 toast 兜底提示。
5. 「补充报价」徽标：沿用 finding 的 `outsideQuote`（已持久化）。`onApplyWorkQuoteItem` 写入 `quoteLineId` 且 `outsideQuote=false`，徽标自动消失；手动清除沿用现有入口。

## 6. 文档同步

1. `docs/04_维修过程相册/29_节点AI分析_单据结构与状态流转梳理.md`：补六步、5 状态矩阵、两级归类、warnings 契约。
2. `docs/15_案例档案与托管状态机.md`：补「完成施工未施工提醒非阻塞」与「报价项待施工/工单漏记」口径。

## 7. 验证

1. `cd backend && npm run sync:shared-utils`
2. `cd backend && node --test src/services/step-advice.test.js`（全部通过）
3. `node --check` 改动过的后端/前端 JS 文件
4. 本地无小程序运行环境，前端以静态检查 + 预发真机验证
5. 按 deploy.md 部署预发：
   - `git add <files>` → `git commit -m "..."` → `git push staging main`
   - 服务器：`cd /var/www/zhejian-staging/backend && npm install && npm run sync:shared-utils && npm run db:setup:prod && pm2 restart zhejian-api-staging`
   - `curl -s https://staging.zhejian.simplewin.cn/api/v1/health`
6. 预发案例 `alb_svc_mwc1mcom_8fac1f`（浙A13254T / 盈简科技）：进施工节点确认面板出现三块；报价 5 项、工单 1 项时出现 4 项待施工；点「完成施工」弹非阻塞提醒。

## 8. 明确不做

- 不改报价节点、检测节点、交车节点的 AI 分析逻辑。
- 不新增数据库表/字段。
- 不强制中断完成施工，不覆盖交车流程。
- 不删除旧字段产出，仅前端停用。
