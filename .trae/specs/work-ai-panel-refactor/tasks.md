# 施工节点 AI 分析重构 · 任务清单

前置：spec.md 获用户批准后开始。

## T1 共享纯函数（utils/service-flow-docs.js）

- [x] `collectConfirmedQuoteLines` 改 content 优先读取报价行（回退 payload）
- [x] 新增 `normalizeItemName`
- [x] 新增 `resolvePresetItemName(rawName, presetNames)`
- [x] 新增 `computeUnstartedQuoteItems(flowNodes)`，返回 `{ items, total }`
- [x] 导出以上函数
- 验证：`cd backend && npm run sync:shared-utils`

## T2 施工 AI 契约（backend/src/services/step-advice.service.js）

- [x] `workRows` 增加 `quoteLineId`
- [x] `contextOf` 增加 `quoteItemRows`
- [x] `workInstruction` 重写为六步 prompt（禁自造名、两级归类、检查类只看结论）
- [x] `parseWorkAdvice` 输出 `schema/quoteAdvice/workItems/quoteOnlyItems`，并派生旧字段
- [x] `adviceHasContent` / `fingerprintFor`（v2）/ `sanitizeStepAdviceForView` 同步
- 验证：`cd backend && node --test src/services/step-advice.test.js`

## T3 单测（backend/src/services/step-advice.test.js）

- [x] 5 状态矩阵
- [x] 先工单 → 再报价 → 最后新增
- [x] 「划痕修复」归并、不同项目不合并
- [x] 报价有工单无有图 → `work_missing`
- [x] 检查类 0 元计入未施工
- 验证：同上，全部用例通过

## T4 完成施工提醒（backend/src/services/service-flow.service.js）

- [x] 引入 `computeUnstartedQuoteItems`
- [x] `completeFlowNode` 对 work 节点返回 `warnings:[{code:'QUOTE_ITEMS_NOT_STARTED',total,items}]`
- 验证：`node --check`；预发接口手测

## T5 前端面板（packageMerchant/pages/album/flow/index.js + index.wxml）

- [x] `decorateWorkAdvice` 扩展三块数据与 `showLegacy`
- [x] wxml 增加「施工建议（按报价项）」「工单项」「报价项待施工」，旧区块降级
- [x] `onApplyWorkItemAdvice`（fill/supplement）
- [x] `onApplyWorkQuoteItem`（按报价行建工单项，写 quoteLineId，不弹补充报价）
- 验证：`node --check`；预发真机

## T6 完成施工交互（同上前端）

- [x] work 分支完成前查未施工，弹非阻塞确认（仍然完成 / 去看看）
- [x] 「去看看」跳报价单阶段，不阻断
- [x] 接口 `warnings` 兜底 toast
- 验证：预发真机点击

## T7 文档

- [x] `docs/04_维修过程相册/29_节点AI分析_单据结构与状态流转梳理.md`
- [x] `docs/15_案例档案与托管状态机.md`

## T8 部署与验收

- [x] `git add` 具体文件 → `git commit -m "..."`
- [x] `git push staging main`
- [x] 服务器：`cd /var/www/zhejian-staging/backend && npm install && npm run sync:shared-utils && npm run db:setup:prod && pm2 restart zhejian-api-staging`
- [x] `curl -s https://staging.zhejian.simplewin.cn/api/v1/health`
- [x] 案例 `alb_svc_mwc1mcom_8fac1f` 走查：三块渲染、待施工数量、完成提醒



