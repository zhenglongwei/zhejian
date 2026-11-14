# 交车节点取消 AI · 托管预览生成 · 执行任务

状态：待用户批准（批准后才动代码）

## T1 后端停用交车 AI

- [x] `backend/src/services/service-flow.service.js`：`saveFlowNode` 删除 `startDeliveryAdvice` 分支与冻结豁免，只留接车/检测/施工。
- [x] `backend/src/services/step-advice.service.js`：删除 `queueDeliveryAdviceIfNeeded` 导出；旧数据解析保留。
- [x] 确认打码链路完全未动：`ensureHostDesensitizeTask`、`runAutoMask`、脱敏任务。

## T2 后端托管页生成（图片分两种处理）

- [x] `backend/src/services/case-hosting.service.js`
  - `generateHostedGeoDraft`：未托管也可生成（只要求整单完工）；删除 archiveCopy 复用；失败才用规则草稿；未托管不改托管阶段。
  - 判断节点是否跑过 AI（`intakeAdvice / inspectionAdvice / workAdvice / quoteAssist / deliveryAdvice`）。
  - 没跑过 AI 的节点：收集图片 ID，调 `ensureAlbumImageVisionCache(albumId, imageIds)` 补图分析（只处理缺缓存，复用脱敏图和缓存）。
  - 打码未就绪：返回 `imageAnalysisPending`，仍给文字草稿。
  - 新增 `collectNodeAiContext(flowNodes)`：已分析节点的 AI 结论/图说，去重限 4000 字。
  - 新增 `collectImageDescriptions(visionResults, flowNodes)`：合并每图描述与已分析节点的图片说明。
  - 最终用 `config.geoLlm` 汇总生成 `summary / highlights / faq`，写回 `geoDraft`。
- [x] `backend/src/prompts/hosted-storefront-copy-v0.md`：说明输入含每图分析与节点结论；禁止编造。
- [x] `backend/src/services/case-hosting.smoke.test.js`：补三条断言（不再要求先托管、只把未分析节点的图交识图、空相册不报错）。

## T3 前端交车节点去 AI

- [x] `packageMerchant/pages/album/flow/index.wxml`：AI 按钮排除 finish；删 `deliveryAdvicePanel` 模板与交车面板分支；判断条件去掉 `deliveryAdvice`。
- [x] `packageMerchant/pages/album/flow/index.js`：finish 不打开 AI 面板、不发请求；删除交车 AI 专用函数与调用；旧 `deliveryAdvice` 仅留返工拦截读取。

## T4 前端托管预览页

- [x] `packageMerchant/pages/album/host/index.js`：未托管也调用生成；已有摘要不重复调用；新增 `onRegenerateGeoDraft`；失败回落旧副本；处理 `imageAnalysisPending` 提示。
- [x] `packageMerchant/pages/album/host/index.wxml`：店页摘要旁加「AI 生成」按钮、生成中与图片分析中提示。
- [x] `packageMerchant/pages/album/host/index.wxss`：标题行布局样式。

## T5 校验与部署

- [x] `node --check` 5 个 JS；`cd backend && npm run test:case-hosting`（smoke ok）。
- [x] 全仓搜索：`startDeliveryAdvice` 无前端调用、`queueDeliveryAdviceIfNeeded` 无引用、`deliveryAdvicePanel` 无引用；打码任务代码未删。
- [x] 代码路径核对：交车节点无 AI 入口；预览先打码再生成；部分节点跑过 AI 时不重复分析，未跑过的图补分析（真机请在预发复验一次）。
- [x] 本地 commit → `git push staging main`（6de9a31c）→ 预发 `npm install`、`pm2 restart zhejian-api-staging` → health ok。

---

# 二期任务：打码 + 内容描述合并为一次调用（待批准）

状态：待用户批准（批准后才动代码）

## T6 单图状态与合并调用

- [x] `constants/service-flow-nodes.js`：新增 `ANALYZABLE_PHOTO_KINDS`、`NODE_ADVICE_FIELDS`、`NODE_KIND_ADVICE`、`nodeAdviceValue`、`hasNodeAiAdvice`。
- [x] `backend/src/utils/flow-photo-mask-writeback.js`：槽位支持 `contentDescription / contentAnalyzedAt`，字符串槽升级为对象，早退条件与 pair 透传同步。
- [x] `backend/src/services/model-mask.service.js`：新增 `descriptionFor`；`applyModelMasks` 写入非空描述与时间戳（含 `llm_failed` 但有描述的情况）。
- [x] `backend/src/services/host-privacy-llm.service.js`：prompt 同时返回 `masks[].description`；`rerunHostPrivacyLlmForUrls` 接收 `describeUrlKeys` 并标记 `wantDescription`。
- [x] `backend/src/services/hosted-public-mask.service.js`：新增 `loadHostDescribeUrlKeys(albumId, { maxImages: 30 })`，取全部公开且未跑 AI、尚无描述的节点图片（含完工照、补充报价图）。
- [x] `backend/src/services/desensitize.service.js`：`runAutoMask` 的 hostPublic 分支取描述键集合并透传。

## T7 汇总侧只读节点

- [x] `backend/src/services/case-hosting.service.js`：新增 `collectAnalyzableImageDescriptions`；`collectImageDescriptions` 去掉 12 条上限；`generateHostedGeoDraft` 删掉识图服务与就绪门槛，`imageAnalysisPending` 恒 false。
- [x] `backend/src/services/album-vision-ondemand.service.js`：`ensureAlbumImageVisionCache` 去掉 8 张上限（主题卡上限保留）。
- [x] `backend/src/prompts/hosted-storefront-copy-v0.md`：补 `imageDescriptions` 使用口径。

## T8 校验与部署

- [x] 更新 `backend/src/services/case-hosting.smoke.test.js`：删除 `collectUnanalyzedNodeIds` 用例，新增节点类型过滤与描述收集用例，补 15 条描述不截断断言。
- [x] `node --check` 改动文件；`cd backend && npm run test:case-hosting` 通过。
- [x] 搜索确认：`collectUnanalyzedNodeIds` 无引用；`collectImageDescriptions` 无 12 条上限；`ensureAlbumImageVisionCache` 无 `vision.maxImages`。
- [x] 本地 commit（9a5c3153）→ `git push staging main` → 预发 `npm install`、`npm run sync:shared-utils`、`pm2 restart zhejian-api-staging` → health 通过。
