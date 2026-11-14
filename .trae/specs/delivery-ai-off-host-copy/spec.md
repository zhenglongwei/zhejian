# 交车节点取消 AI · 托管预览生成简述与 FAQ · 规格说明

状态：待用户批准（批准后才动代码）

## 1. 要做什么

1. 交车节点里的 AI 入口、AI 面板、AI 请求全部删掉，后端也不再给它排队生成。
2. 「完工简述 + FAQ」挪到托管预览页：进入预览时生成一次，页面再提供「AI 生成」按钮可重跑。
3. 生成时按「图片是否已经在节点里分析过」分两种处理，遵守项目原则：
   - **跑过 AI 的节点**：图片已经有内容分析和打码结果，直接拿这些文字做上下文，**不再分析第二次**。
   - **没跑过 AI 的节点**：图片还是原图。托管预览时先把这些原图交给现有识图服务，输出每张图的文字内容分析；打码仍走现有打码任务。
4. 最后汇总：每张图的文字内容 + 整个相册各节点的单据和 AI 结论 → 生成简述、亮点、FAQ。
5. 不再依赖交车 AI 写下的副本。

## 2. 关键原则

- 图片只在「节点 AI 分析」或「托管时补分析」中二选一，绝不重复分析。
- 已分析节点的图直接复用文字结论与打码结果。
- 未分析节点的图在托管预览时补一次：内容分析 + 打码分析。
- **打码任务保留不动**：现有 `ensureHostDesensitizeTask`、`runAutoMask`、脱敏任务、打码状态页全部不删；托管预览仍先打码，再生成文案。

## 3. 生成流程（托管预览）

1. 商家进入「公开托管」预览，先执行现有打码流程（`ensureAutoMaskOnReview`，不改）。
2. 后端判断每个节点是否跑过 AI：
   - 看节点上的 `intakeAdvice / inspectionAdvice / workAdvice / quoteAssist / deliveryAdvice` 是否有已完成内容。
   - 有：该节点所有图片视为已分析，取节点里已有的分析文字/图说。
   - 没有：收集该节点的图片 ID，交给现有识图缓存服务 `ensureAlbumImageVisionCache` 逐张补分析（只处理没有缓存的图，只送脱敏图，结果按图缓存）。
3. 如果打码还没就绪，识图服务返回「处理中」：本次先不给图分析，返回可编辑的文字草稿，前端提示「图片分析中，稍后点 AI 生成」。
4. 汇总两类文字：
   - 每张图的内容分析文字（来自节点结论或识图缓存）。
   - 各节点单据事实（诉求、检测、报价、工单、验收/质保）与已有图说、问答。
5. 交给现有文本模型 `config.geoLlm` 生成 `summary / highlights / faq`，写回 `hostMeta.geoDraft`。
6. 前端展示草稿，可编辑；点「AI 生成」带 `forceRegen` 重跑。

## 4. 改动清单

### 4.1 前端 · 交车节点去 AI（`packageMerchant/pages/album/flow`）

- `index.wxml`：AI 悬浮按钮排除交车节点（`stageBoard.family !== 'finish'`）；删除 `deliveryAdvicePanel` 模板和交车 AI 面板分支；面板判断条件去掉 `deliveryAdvice`。
- `index.js`：交车节点不再打开 AI 面板、不再发 `startDeliveryAdvice`；删除 `onStartDeliveryStepAdvice`、`onStartDeliveryAdvice`、`onApplyDeliveryAdvice`、`decorateDeliveryAdvice` 及相关调用。旧相册已有的 `deliveryAdvice` 只保留读取，用于原「AI 建议返工」拦截，不再展示。

### 4.2 后端 · 停用交车 AI

- `backend/src/services/service-flow.service.js`：`saveFlowNode` 删除 `startDeliveryAdvice` 分支和冻结豁免，只留接车/检测/施工建议。
- `backend/src/services/step-advice.service.js`：删除 `queueDeliveryAdviceIfNeeded` 导出；旧数据解析保留。

### 4.3 后端 · 托管页生成

`backend/src/services/case-hosting.service.js` 的 `generateHostedGeoDraft`：

1. **未托管也能生成**：不再要求先托管，只要求整单已完工；未托管时不改托管阶段。
2. **删掉 archiveCopy 复用**：每次调用重新生成，失败才用规则草稿。
3. **补图分析**：
   - 找出没跑过 AI 的节点，取其图片 ID。
   - 调用 `ensureAlbumImageVisionCache(albumId, imageIds)`：只处理缺缓存的图，复用已有识图缓存，不重复分析。
   - 打码就绪由同一函数内部检查；未就绪返回 `imageAnalysisPending`，不阻塞草稿生成。
4. **汇总输入**：
   - 现有 `buildCaseFactPack` 的整单文字事实。
   - 新增 `collectNodeAiContext(flowNodes)`：收集已分析节点的 AI 结论与图说文字，去重、限 4000 字。
   - 新增 `collectImageDescriptions(visionResults, flowNodes)`：合并「识图缓存返回的每图描述」与「已分析节点里的图片说明」。
5. **最终生成**：用 `config.geoLlm` 文本模型，输入以上三部分，输出简述/亮点/FAQ；字段结构沿用现有 `geoDraft`。
6. 生成成功后仍写 `archiveCopy`，但只作为托管页自己的草稿副本。

`backend/src/prompts/hosted-storefront-copy-v0.md`：

- 输入里明确包含「每张图的内容分析」和「各节点分析结论」。
- 禁止编造图里看不到、单据没写的内容；图文冲突以单据文字为准。

### 4.4 前端 · 托管预览页

- `host/index.js`：进入公开预览时，无论是否已托管都调用生成接口；已有摘要时沿用，不重复调用；新增 `onRegenerateGeoDraft`（`forceRegen: true`）；生成失败且未托管时退回旧 `archiveCopy` 回显，商家可手填。
- `host/index.wxml`：店页摘要标题右侧加「AI 生成」按钮（仅未托管 + 公开模式）；生成中提示「正在读整单记录，整理简述与问答…」；图片补分析中提示「图片分析中，稍后点 AI 生成」。
- `host/index.wxss`：新增标题行布局样式，复用现有令牌。

## 5. 不动的东西

- 打码任务、脱敏服务、打码状态页、公开前隐私校验。
- 各节点原有的 AI 分析（接车/检测/施工/报价）。
- 公开页渲染、FAQ 公开过滤规则、确认公开接口。

## 6. 验证

1. `node --check` 改动的 5 个 JS。
2. `cd backend && npm run test:case-hosting` 通过，补 3 条断言：
   - 托管生成不再要求「先托管」；
   - 没跑 AI 的节点会把图片 ID 交给识图缓存，跑过 AI 的节点不交；
   - 空相册/无图时 `collectNodeAiContext` 与 `collectImageDescriptions` 返回空，不报错。
3. 全仓搜索确认：`startDeliveryAdvice` 无前端调用、`queueDeliveryAdviceIfNeeded` 无引用、`deliveryAdvicePanel` 无引用、打码任务相关代码未被删除。
4. 预发手工验证：
   - 交车节点没有 AI 按钮和面板。
   - 整单完工后进入「公开托管」预览：先打码，再自动出简述和 FAQ；点「AI 生成」可重跑。
   - 只跑过部分节点 AI 的相册：已分析节点的图不重复分析，未分析节点的图会补分析后进入文案。
5. 部署：本地 commit → `git push staging main` → 服务器 `git pull`、`npm install`、`pm2 restart zhejian-api-staging` → health 通过。

## 7. 待确认

1. 已托管/已公开的相册是否也需要「AI 生成」按钮？默认不做，需先取消公开再改文案。
2. 交车节点旧 `deliveryAdvice` 数据是否保留只读（用于历史返工拦截）？默认保留。

---

# 二期（新增，待批准）：托管预览「打码 + 内容描述」合并为一次视觉模型调用

状态：待用户批准（批准后才动代码）

## 8.1 要解决什么

现状是两次视觉分析：

1. `runAutoMask` → `rerunHostPrivacyLlmForUrls`：只让模型返回 `masks`，用来贴码。
2. `generateHostedGeoDraft` → `ensureAlbumImageVisionCache`：再让模型描述同一批图。

由此产生四个问题：

- 同一张图可能被分析两次，白烧模型。
- `ensureAlbumImageVisionCache` 要求「整本脱敏就绪」，一张没就绪就整批返回 `pre_mask_pending`，内容分析全跳过。
- 识图仍受 `vision.maxImages`（默认 8）限制。
- `collectImageDescriptions` 最后 `.slice(0, 12)`，描述最多 12 条。

## 8.2 目标

- **一次调用**：每张待分析图只调一次视觉模型，同一份响应里同时返回打码区域与该图内容描述。
- **状态驱动**：单图状态住在节点照片槽，打码结论与内容结论并排存：
  - 打码：`maskOutcome / maskedUrl / maskRegions / maskSource`（已有）
  - 内容：`contentDescription / contentAnalyzedAt`（新增）
- **不重复分析**：节点已跑过 AI 的图不再送模型，只把节点里已有文字当上下文。
- **汇总不再看图**：`generateHostedGeoDraft` 只读节点描述 + 节点文案，交给文本模型出 summary / FAQ，全程不调视觉模型。
- **触发点不变**：只在点击「公开预览」时由 `ensureAutoMaskOnReview` 触发，不做后台预热。
- **范围（已按实测反馈修订）**：描述全部公开图片，包括 `inspection` / `work`（补充施工、返工也是 `work`）、`delivery_photos` 完工照，以及 `subKind === 'add_on_quote'` 的补充报价图；排除只留档的 `intake` 与首次报价；待描述图片上限 30 张。已有打码结论但缺描述的图也要补一次视觉分析，已有描述的不重复分析。
- **取消旧限制**：去掉整本脱敏就绪门槛、去掉 12 条描述上限、托管链路不再用 8 张上限。

## 8.3 改动清单（精确到文件与函数）

### 8.3.1 `constants/service-flow-nodes.js`

- 新增 `ANALYZABLE_PHOTO_KINDS = ['inspection', 'work', 'delivery_photos']` 与 `isAnalyzablePhotoNode(node)`；后者额外纳入补充报价节点、排除首次报价节点。
- 新增 `NODE_ADVICE_FIELDS`、`NODE_KIND_ADVICE`、`nodeAdviceValue(node)`、`hasNodeAiAdvice(node)`（把 `case-hosting.service.js` L427-452 的判定搬过来，语义不变）。
- `hasNodeAiAdvice(node)` = `Boolean(nodeAdviceValue(node))`。

### 8.3.2 `backend/src/utils/flow-photo-mask-writeback.js`

- `applyMaskResultToSlot(slot, rawKeys, meta)` 支持 `meta.contentDescription` 与 `meta.contentAnalyzedAt`：
  - 传入字符串槽时先升级为 `{ url, ... }` 对象再写。
  - `contentDescription` 与槽上现值不同才写；同时写 `contentAnalyzedAt`。
  - 不得影响现有 `maskedUrl / maskOutcome / maskRegions / maskSource` 行为。
- `writeMaskResultIntoFlowNodes` 早退条件加入 `meta.contentDescription === undefined`，只有描述时也能写。
- `writeMaskedPairsIntoFlowNodes` 透传 `contentDescription / contentAnalyzedAt`。

### 8.3.3 `backend/src/services/model-mask.service.js`

- 新增 `descriptionFor(masks, row, index)`：按 `imageSlot` 命中，取 `hit.description || hit.content`，trim 后截 400 字；模型没给该图条目返回 `null`。
- `applyModelMasks`：每个 pair 附带非空 `contentDescription` 与 `contentAnalyzedAt`（整批一个时间戳）。
  - `regions == null`（模型漏图，记 `llm_failed`）时，只要描述非空仍写入描述，便于下次不重复分析。
- `regionsFor` 行为不变。

### 8.3.4 `backend/src/services/host-privacy-llm.service.js`

- prompt 改为一次返回两样：

```json
{"masks":[{"imageSlot":1,"regions":[{"kind":"plate","left":0,"top":0,"width":0,"height":0}],"description":"左前轮刹车片磨损到报警线，已拆下旧片"}]}
```

- 描述口径写进指令：40~80 字、写部位/故障/作业/材料，不写车牌/姓名/电话；标注「需内容描述」的图必须给，其余给空字符串；`masks` 条数仍必须等于本批张数。
- `rowsFromUrls` 支持 `wantDescription`。
- `rerunHostPrivacyLlmForUrls(urls, { albumId, describeUrlKeys })`：
  - `describeUrlKeys` 是 `rawUrlLookupKeys` 键集合；命中的行标 `wantDescription: true`，标签变 `图N（需内容描述）`。
  - 未命中或未传时照旧只打码。
- `markUrlsLlmFailed` 不变。

### 8.3.5 `backend/src/services/hosted-public-mask.service.js`

- 新增 `loadHostDescribeUrlKeys(albumId, { maxImages = 30 } = {})`：
  - 读 `contentPackageJson.flowNodes`。
  - 只遍历 `ANALYZABLE_PHOTO_KINDS` 且 `!hasNodeAiAdvice(node)` 的节点。
  - 收集该节点 `content / photoDraft / document.payload` 下 `photos / discoveryImages / pendingImages / findings / workItems / items / lines / acceptanceItems / row.images / evidenceUrl` 的图 URL。
  - 按 `rawUrlLookupKeys` 去重，最多 30 个 URL，返回键集合。
  - 不读任务行、不读媒体表（与现有节点真源口径一致）。

### 8.3.6 `backend/src/services/desensitize.service.js`

- `runAutoMask` 的 `hostPublic` 分支（L1243-1294）：
  - 调 `loadHostDescribeUrlKeys(task.bizId)` 得到 `describeUrlKeys`。
  - `rerunHostPrivacyLlmForUrls(llmUrls, { albumId: task.bizId, describeUrlKeys })`。
  - 其余队列统计、restamp、任务行同步逻辑不动。
- L1571 单张重试调用不传描述集合，行为不变。

### 8.3.7 `backend/src/services/case-hosting.service.js`

- 新增 `collectAnalyzableImageDescriptions(flowNodes)`：
  - 只遍历 `ANALYZABLE_PHOTO_KINDS` 节点。
  - 收集各图槽 `contentDescription`（非空、去重、不截断条数）。
- `collectImageDescriptions(descriptions, flowNodes)`：
  - 第一段入参改为描述字符串数组。
  - 删除结尾 `.slice(0, 12)`。
  - 第二段仍合并已分析节点的 `photoDraft.publicCaptions / findings` 图说。
- `generateHostedGeoDraft`（L629-733）：
  - 删除 `collectUnanalyzedNodeIds`、`ensureAlbumImageVisionCache`、`pre_mask_pending`、`imageAnalysisPending` 相关分支。
  - `imageDescriptions = collectImageDescriptions(collectAnalyzableImageDescriptions(flowNodes), flowNodes)`。
  - 返回值保留 `imageAnalysisPending: false` 字段，避免前端改动。
  - 其余（完工校验、规则兜底、写 `hostMeta.geoDraft`、阶段推进）不动。
- 删除 `collectUnanalyzedNodeIds` 函数与导出；`collectAnalyzableImageDescriptions` 加入导出供测试。

### 8.3.8 `backend/src/services/album-vision-ondemand.service.js`

- `ensureAlbumImageVisionCache` 删除 `rows.slice(0, vision.maxImages)`，不再限 8 张（遗留 `generateMerchantPublicCase` 路径同样放开）。
- `interpretAlbumThemeCard` 的主题卡上限保持不动（与托管预览无关）。

### 8.3.9 测试

- `backend/src/services/case-hosting.smoke.test.js`：
  - 删除 `testCollectUnanalyzedNodeIds`。
  - 新增 `testCollectAnalyzableImageDescriptions`：
    - `inspection` / `work` / `delivery_photos` / 补充报价节点的槽位 `contentDescription` 被收集；
    - `intake` 与首次报价节点被排除；
    - 空节点返回 `[]`。
  - `testCollectImageDescriptions`：改用描述数组入参，并断言 15 条描述全部保留（不被截断）。
- `flow-photo-mask-writeback` 相关测试（若现有测试文件存在则补用例）：`writeMaskedPairsIntoFlowNodes` 同时写 `maskedUrl` 与 `contentDescription`，字符串槽升级为对象。
- `node --check` 所有改动 JS。

### 8.3.10 Prompt

- `backend/src/prompts/hosted-storefront-copy-v0.md`：如现有输入说明未覆盖，补一句「`imageDescriptions` 是单次视觉分析产出的每图描述，可直接引用，不得编造」。

## 8.4 明确不做

- 不做后台预热、不做定时任务。
- 不新增第二次视觉调用；`generateHostedGeoDraft` 内不再调用任何视觉模型。
- 不改前端 `enterPublicPreview` 顺序（仍是先 `ensureAutoMaskOnReview` 再 `ensureGeoDraftForPreview`）。
- 不改公开页渲染字段；`contentDescription` 只作分析上下文，不上公开页。

## 8.5 验证

1. `node --check` 改动文件。
2. `cd backend && npm run test:case-hosting` 通过。
3. 全仓搜索确认：
   - `case-hosting.service.js` 不再出现 `ensureAlbumImageVisionCache`、`collectUnanalyzedNodeIds`；
   - `collectImageDescriptions` 内无 `.slice(0, 12)`；
   - `ensureAlbumImageVisionCache` 内无 `vision.maxImages`。
4. 预发手工验证（整单完工相册）：
   - 点「公开预览」，后端日志 `[runAutoMask] host privacy queue` 后，视觉模型只按批调用一次；
   - 节点照片槽出现 `contentDescription`，`maskOutcome` 仍正确；
   - 店页摘要/FAQ 用到了多条图片描述；
   - 接车与首次报价节点无 `contentDescription`；完工照与补充报价图有 `contentDescription`。
5. 部署：本地 commit → `git push staging main` → 服务器 `git pull`、`npm install`、`npm run sync:shared-utils`、`pm2 restart zhejian-api-staging` → health 通过。

## 8.6 待确认

1. 30 张上限只约束「本次待描述」的图片；已分析节点里已有的描述在汇总时全部纳入（不受 30 限制）。默认如此。
2. 描述为空（模型没写出内容）的图不写 `contentAnalyzedAt`，下次托管仍可能再描述一次；默认接受，避免把「没识别出内容」永久判死。
