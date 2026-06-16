# GEO 案例引用优化开发计划

> **生效日期**：2026-06-16  
> **状态**：定稿 · 待执行  
> **与主计划关系**：本文件为 **独立专项计划**；任务进度在本文件勾选；完成后在 [`docs/00_开发计划.md`](../00_开发计划.md) §2.6 更新汇总状态即可，**不**将细项并入 §7 各卷表格。  
> **战略依据**：公域 H5 = AI/搜索引用主战场；小程序 = 按节点生产证据链，**不**新增与节点重复的汇总表单。  
> **规范真源**：[`04_AI可引用摘要规范.md`](./04_AI可引用摘要规范.md) · [`03_结构化数据 Schema 规范.md`](./03_结构化数据 Schema 规范.md) · [`07_案例生成规则.md`](../04_维修过程相册/07_案例生成规则.md) · [`02_相册模板与节点规则.md`](../04_维修过程相册/02_相册模板与节点规则.md) §2.1 六阶段

---

## 1. 文档信息

| 项目 | 内容 |
| --- | --- |
| 文档名称 | GEO 案例引用优化开发计划 |
| 当前版本 | V1.1 |
| 适用范围 | 商家服务相册（节点 note）、案例文章生成、运营审核台、H5 案例详情 |
| 不在范围 | 小程序公域发现 UI、全站 SSG/SSR（`DS-C-13/14`）、车型聚合页（`DS-C-06` 搁置）、评价/交易 |
| 任务 ID 前缀 | `GEO-CITE-*` |

### 1.1 进度标记

| 标记 | 含义 |
| --- | --- |
| `[ ]` | 待开发 |
| `[~]` | 进行中 / 部分完成 |
| `[x]` | 已完成 |
| `[延]` | 延期 |
| `[-]` | 本计划不做 |

---

## 2. 问题与目标

### 2.1 现状缺口

| 环节 | 现状 | 问题 |
| --- | --- | --- |
| 商家录入 | 六阶段 Tab + 节点传图 + 节点 `note` 自由描述 | **产品形态正确**，无需再加「故障/检查/方案」总览表单 |
| 文章生成 | `case-article-generator` 主要从 `storeNote` 拆句；检查结论多为模板套话 | **真源在节点，生成器未聚合** |
| 主路径相册编辑 | `packageMerchant/pages/album/edit` 无 `storeNote` UI | 公开摘要更易落空为泛化文案 |
| 运营台 | 案例审核无 GEO 文案 diff / 编辑 | AI 摘要质量无法在发布前收口 |
| LLM | 无 | 节点口语化内容未整理为可引用文体 |

### 2.2 目标（一句话）

**节点证据链 → 可引用事实块（`ai_summary` / Schema / 结构化 geo）→ 供生成式引擎检索与摘引**；相册页主要服务 **AI 与搜索**，不是让人通读长文。

### 2.3 战略假设与验收哲学（2026-06-16）

| 假设 | 对产品的影响 |
| --- | --- |
| 越来越多人用 **AI 做选择** | 成功 = 答案中 **稳定出现可溯源事实** 或链到辙见 URL，而非案例详情 **停留时长** |
| AI 越来越会 **压低营销文案权重** | 成稿优先 **事实句**（故障/检查/方案/结果），LLM 仅润色不扩写 |
| 用户 **懒**，极少通读案例 | H5 案例页：**首屏摘要 + 关键信息 + CTA**；过程图主要为 **可信与 Schema**，不为「深度阅读」 |
| **若假设不成立** | 地图/点评在「人找店」场景碾压；本专项 ROI 存疑 — 见 [`07`](./07_GEO引用观测开发计划.md) 探测验证 |

**验收重心**（与 [`07`](./07_GEO引用观测开发计划.md) §2.5 对齐）：

1. **供给质量**：节点聚合后 `ai_summary` 是否为可独立摘引的事实段（非模板套话）。
2. **机器可读**：Schema / 预渲染 / 首屏 HTML 是否含摘要与结构化字段。
3. **引后转化**：带 `utm` 或探测归因的 **咨询/电话**（`h5_consult_click` / `h5_call_click`），非 `h5_case_view` 时长。

**不作为主成功指标**：案例页 PV、滚动深度、用户阅读完成率（可作辅助，不作专项验收）。

### 2.4 已确认产品决策（2026-06-16）

| # | 决策 |
| --- | --- |
| 1 | **不新增**相册顶部 `issue_desc` 等与六阶段重复的输入框；GEO 字段从 **`album_nodes.note` + `planAmount` + 配件** 聚合 |
| 2 | **`storeNote` 保留**为「整单补充说明」，**不参与** `faultDesc` / `repairPlan` 主逻辑 |
| 3 | **质量闸门**：提交审核 **block**（证据链缺失）；运营审核 **warn**（完整度低）；**存量已上线案例不 retroactive block** |
| 4 | **LLM 角色**：编辑/润色，**禁止编造**输入中不存在的事实；规范 §14：**AI 生成摘要必须人工审核** |
| 5 | **运营台**：默认展示 LLM 建议稿与节点原稿 **diff**；**批准前不将 LLM 稿发布到 H5**；可「采用建议 / 保留原稿 / 手工改」 |
| 6 | **多模态**（脱敏图 → 图说/alt）：放 **阶段 D（二期）**；阶段 C 仅文本 LLM |

---

## 3. 设计原则（开发红线）

1. **证据先于说服**：摘要每一句可追溯到某节点 `note`、价格或配件记录。
2. **节点是真源**：`public_cases.content_json.geo` 为发布快照；聚合逻辑变更后须支持 `regenerate` + 运营复核。
3. **LLM 不替代 block**：缺关键阶段图/文由 **规则拒绝提交**，不由模型「补写」。
4. **只传脱敏资源给模型**：LLM/多模态输入仅脱敏图 URL + 已脱敏文本；禁止原图、车牌、手机号进 prompt。
5. **失败可回退**：LLM 超时/拒答/合规拦截 → 回落 **模板聚合**（`generationSource: template`），不阻断审核链路。
6. **商家 UX 不变**：继续自由描述；仅加强各阶段 `notePlaceholder` 引导（非固定格式）。
7. **合规内置**：生成后过 `compliance-copy` / 营销禁词表；制动/转向/事故车等须 `riskChecked` 人工勾选（对齐规范 §14）。
8. **人机分工**：案例详情 **给人** 看摘要与 CTA；**给模型** 看完整结构化块与 Schema；不追求让人翻完六阶段图集。

---

## 4. 数据流与阶段映射

### 4.1 六阶段 → GEO 字段（聚合规则）

| 阶段 `nodeId` | 阶段名 | 聚合为 |
| --- | --- | --- |
| `stage_1` | 接车记录 | `faultDesc`（故障/需求）；里程取自 `vehicle_json.mileage`（若后续入库） |
| `stage_2` | 检测诊断 | `inspectResult` |
| `stage_3` | 方案与报价 | `repairPlan`（可拼接 `planAmount` 说明，非成交价承诺） |
| `stage_4` | 配件告知 | `priceFactors` / 正文配件段 |
| `stage_5` | 施工记录 | `nodeNarratives` / 过程段 |
| `stage_6` | 完工交付 | `resultConfirm` |
| `album.storeNote` | 补充说明 | `geo.sections.storeNote` 附录，可选 |

### 4.2 端到端流程（目标态）

```text
商家：按节点传图 + note（自由描述）
  → 提交公开审核
  → [规则 block] 关键阶段证据是否齐全
  → 脱敏完成
  → [阶段 A] 节点聚合 → 模板生成初稿（article_status: ready）
  → [阶段 C] 异步 LLM 文本优化 → 建议稿（generationSource: llm_v1, riskChecked: false）
  → 运营台 diff 审核 → 批准
  → 落库 ai_summary / article_body / geo → published_h5
  → H5 展示（[阶段 E 可选] Bot 预渲染）
```

---

## 5. 阶段划分总览

| 阶段 | 名称 | 优先级 | 依赖 | 产出 |
| --- | --- | ---: | --- | --- |
| **A** | 节点聚合 + 规则闸门 | P0 | 无 | 真源进生成器；缺证据可 block |
| **B** | 模板生成升级 + 运营可编辑 | P1 | A | 无 LLM 也能发布高质量稿 |
| **C** | LLM 文本优化 + diff 审核 | P1 | A、B | 可引用文体 + 人工必审 |
| **D** | 多模态图说 / alt（二期） | P2 | C | ImageObject 友好 |
| **E** | H5 Bot 预渲染 | P2 | B | 爬虫不跑 JS 可读正文 |

**推荐顺序**：`A → B → C → D`；`E` 与 `C` 可并行。

---

## 6. 阶段 A · 节点聚合 + 规则闸门（P0）

> **验收**：商家仅在节点填写说明 → 提交审核 → `generate-content` 后 `geo.faultDesc` 等为 stage note 内容，而非 `storeNote` 或纯模板句。

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-CITE-A01 | 节点 → GEO 聚合工具 | `backend/src/utils/album-geo-extract.js`（新建） | P0 | [x] | `extractGeoFromAlbumNodes(nodes, albumMeta)` → fault/inspect/plan/result/priceFactors |
| GEO-CITE-A02 | 生成器接入聚合 | `backend/src/services/case-article-generator.service.js` | P0 | [x] | 替换 `storeNote` 拆句逻辑；`storeNote` 仅进 sections |
| GEO-CITE-A03 | 模板函数调整 | `backend/src/utils/case-article-templates.js` | P0 | [x] | `buildAiSummary` 吃聚合字段；`buildNodeNarratives` **优先** `node.note` |
| GEO-CITE-A04 | 草稿构建对齐 | `backend/src/services/public-case.service.js` | P0 | [x] | 提交审核时 `content_json.geo` 写入聚合初稿 |
| GEO-CITE-A05 | 规则质量评分 | `backend/src/utils/case-geo-quality.js`（新建） | P0 | [x] | `score` / `level` / `missingFields[]`；**不调 LLM** |
| GEO-CITE-A06 | 提交 block | `backend/src/services/public-case.service.js`、商家冷启动/用户授权提交路径 | P0 | [x] | `level=block` → 409 + 缺项（如 stage_2 无 note 且无图） |
| GEO-CITE-A07 | 存量兼容 | `case-geo-quality.js` | P0 | [x] | **仅新提交**走 block；已 `public_approved` 不拦 |
| GEO-CITE-A08 | 审核详情返回质量 | `backend/src/services/admin-case.service.js` → `getAdminCaseDetail` | P0 | [x] | 增加 `geoQuality`、各 stage 聚合预览 |
| GEO-CITE-A09 | 节点占位引导 | `constants/service-album-stages.js`；`packageMerchant/pages/album/edit/index.wxml` | P1 | [x] | `notePlaceholder` 按阶段区分（现象/检查/方案/完工） |
| GEO-CITE-A10 | 商家完整度展示 | `backend/.../buildServiceAlbumCompleteness`；`packageMerchant/pages/workbench/index.js` | P1 | [x] | 增加 `geoEvidence` 摘要，非新表单 |
| GEO-CITE-A11 | 脱敏工作台提示 | `packageMerchant/pages/desensitize/workbench/index.wxml` | P1 | [x] | 提交前展示 block 缺项（来自 preview API） |
| GEO-CITE-A12 | 预览 API | `backend/src/routes/merchant-service-albums.js` | P1 | [x] | `GET .../geo-preview`：聚合 + 模板摘要，不持久化 |
| GEO-CITE-A13 | 单测 | `backend/src/utils/album-geo-extract.test.js` | P1 | [x] | 六阶段有/无 note 多场景 |
| GEO-CITE-A14 | 冒烟 | `backend/scripts/public-case-smoke.js` | P1 | [x] | block + 聚合字段断言 |
| GEO-CITE-A15 | 文档：字段映射 | `docs/11_数据结构与状态机/06_案例文章与GEO字段映射.md` | P1 | [ ] | 注明真源 = `album_nodes.note` |

### 6.1 阶段 A 验收清单

1. 仅填 stage_1/2/3 note、不填 `storeNote` → 生成摘要含真实故障/检查/方案。
2. stage_2 无 note 且无图 → 商家提交审核 API 返回 409 与 `missingFields`。
3. 已上线案例不受影响；`npm run cases:check` / `h5:chain-smoke` 通过。
4. **摘引自检**：运营抽 3 条案例，`ai_summary` 可单独作为 AI 答案段落朗读，无需点开过程图（人工评审表）。

### 6.2 阶段 A 与北极星的关系

本阶段不考核引用率；为 **L3 `prompt_probe_citation`**（见 [`07`](./07_GEO引用观测开发计划.md)）提供合格原料。

---

## 7. 阶段 B · 模板生成升级 + 运营可编辑（P1）

> **验收**：无 LLM 时运营可改 `ai_summary` 并发布；改稿后 H5 与 API 一致。

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-CITE-B01 | 运营更新 GEO 文案 API | `backend/src/routes/admin.js`；`backend/src/services/admin-case-article.service.js`（新建） | P1 | [x] | `PUT /admin/cases/:id/geo-content` |
| GEO-CITE-B02 | 模板重生成 API | 同上 | P1 | [x] | `POST .../regenerate-article`；**不覆盖**运营已手改字段 |
| GEO-CITE-B03 | 详情 API 扩展 | `backend/src/services/admin-case.service.js` | P1 | [x] | 返回 `aiSummary`、`articleBody`、`seo*`、`geo` 块、节点原稿聚合 |
| GEO-CITE-B04 | 前端 API | `admin-web/src/api/case-review.js` | P1 | [x] | `updateCaseGeoContent`、`regenerateCaseArticle` |
| GEO-CITE-B05 | GEO 编辑面板 | `admin-web/src/components/case-review/CaseGeoEditor.vue`（新建） | P1 | [x] | **摘要优先**；正文次级；字数 100–250 |
| GEO-CITE-B06 | 质量标签 | `admin-web/src/components/case-review/GeoQualityTag.vue`（新建） | P1 | [x] | 展示 `geoQuality.level` |
| GEO-CITE-B07 | 详情页挂载 | `admin-web/src/views/case-review/detail/index.vue` | P1 | [x] | 脱敏区下、审核操作上 |
| GEO-CITE-B08 | 批准弱提醒 | `admin-web/src/components/case-review/ReviewActionBar.vue` | P1 | [x] | `geoQuality=weak` 时二次确认 |
| GEO-CITE-B09 | 小程序 mock 对齐 | `utils/case-content.js` | P2 | [ ] | 与 backend 聚合逻辑一致 |
| GEO-CITE-B10 | 存量补跑 | `backend/scripts/cases-generate-articles.js` | P1 | [ ] | migrate 后文档注明 `--force` |
| GEO-CITE-B11 | 模板单测 | `backend/src/utils/case-article-templates.test.js` | P1 | [ ] | 对齐规范 §10 三示例 |

### 7.1 阶段 B 验收清单

1. 运营修改 `ai_summary` → `GET /user/cases/:id` 与 H5 **首屏**一致。
2. `regenerate-article` 不覆盖手改字段。
3. `weak` 案例可批准但留 audit log。
4. H5 案例页首屏可见：`ai_summary` + 关键信息表 + 转化底栏（过程图可折叠或后置，**不**要求首屏展示全节点）。

---

## 8. 阶段 C · LLM 文本优化 + diff 审核（P1）

> **验收**：脱敏完成后异步出 LLM 建议稿；运营未批准前 H5 仍为模板稿或上一版；批准后 `generationSource=llm_v1` 且 `riskChecked=true`。

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-CITE-C01 | LLM 服务封装 | `backend/src/services/case-geo-llm.service.js`（新建） | P1 | [ ] | prompt、JSON schema 输出、超时、回退模板 |
| GEO-CITE-C02 | Prompt 与约束 | `backend/src/prompts/case-geo-optimize.md`（新建） | P1 | [ ] | 禁止编造；须标注 `missing_evidence[]` |
| GEO-CITE-C03 | 合规后处理 | `case-geo-llm.service.js` + `constants/compliance-copy.js` | P1 | [ ] | 营销禁词拦截 |
| GEO-CITE-C04 | 事实溯源校验 | `backend/src/utils/case-geo-llm-verify.js`（新建） | P1 | [ ] | 输出句 ↔ 节点 note 映射；无法映射则降级 |
| GEO-CITE-C05 | 异步任务触发 | 脱敏完成回调 / `desensitize` 任务链 | P1 | [ ] | 商家提交审核入队；不阻塞提交响应 |
| GEO-CITE-C06 | 建议稿存储 | `public_cases.content_json.geo` 或新列 `geo_llm_draft` | P1 | [ ] | `llmDraft` / `llmGeneratedAt` / `llmStatus` |
| GEO-CITE-C07 | 运营 diff API | `GET /admin/cases/:id/geo-llm-diff` | P1 | [ ] | `original`（聚合+模板）vs `suggestion`（LLM） |
| GEO-CITE-C08 | diff 审核 UI | `admin-web/src/components/case-review/CaseGeoLlmReview.vue`（新建） | P1 | [ ] | 并排/diff；按钮：采用建议、保留原稿、编辑后采纳 |
| GEO-CITE-C09 | 批准落库 | `admin-case.service.js` → `approveAdminCase` | P1 | [ ] | 仅采纳后写入 `ai_summary` 等；`riskChecked: true` |
| GEO-CITE-C10 | 配置与开关 | `backend/src/config/index.js`；环境变量 | P1 | [ ] | `GEO_LLM_ENABLED`、模型 endpoint、仅 prod/staging |
| GEO-CITE-C11 | 失败回退 | `case-geo-llm.service.js` | P1 | [ ] | 失败 → `llmStatus: failed`，审核台显示「使用模板稿」 |
| GEO-CITE-C12 | 审核日志 | `case_review_log` 或 geo 块 | P1 | [ ] | 记录采纳 LLM / 原稿 / 手改 |
| GEO-CITE-C13 | 冒烟 | `backend/scripts/case-geo-llm-smoke.js`（新建） | P2 | [ ] | mock LLM；验证 diff + 批准链路 |

### 8.1 LLM 输出契约（阶段 C）

```json
{
  "aiSummary": "string, 100-250字",
  "seoTitle": "string",
  "seoDescription": "string",
  "faultDesc": "string",
  "inspectResult": "string",
  "repairPlan": "string",
  "resultConfirm": "string",
  "articleBody": "string",
  "missingEvidence": ["stage_6"],
  "confidence": "high|medium|low"
}
```

### 8.2 阶段 C 验收清单

1. 提交审核后 60s 内运营台可见 LLM 建议稿或「生成中」。
2. 未点「采用」前，`published_h5` 不切换为 LLM 稿。
3. LLM 故意返回编造句 → 校验拦截或降级为模板稿。
4. 规范 §14：摘要来源含 `llm_v1` 时审核日志有记录。

---

## 9. 阶段 D · 多模态图说 / alt（二期 · P2）

> **验收**：H5 案例页 `nodeNarratives.imageCaptions` 与 `ImageObject` description 来自脱敏图 + 节点上下文；仍须运营采纳。

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-CITE-D01 | 多模态调用 | `backend/src/services/case-geo-vision.service.js`（新建） | P2 | [ ] | 仅脱敏 URL；禁止描述隐私 |
| GEO-CITE-D02 | 并入 LLM 任务 | `case-geo-llm.service.js` 或独立队列 | P2 | [ ] | 与阶段 C 同 diff 面板扩展「图说」Tab |
| GEO-CITE-D03 | H5 展示 | `h5/shared/case-render.js` | P2 | [ ] | caption/alt 优先 LLM 采纳稿 |
| GEO-CITE-D04 | Schema | `h5/shared/case-render.js` → `ImageObject` | P2 | [ ] | 与可见 caption 一致 |
| GEO-CITE-D05 | 运营采纳图说 | `CaseGeoLlmReview.vue` | P2 | [ ] | 按节点/按图勾选采纳 |

---

## 10. 阶段 E · H5 Bot 预渲染（P2 · 可选）

> 对应主计划 `DS-C-13` 子集；**仅案例详情**，不做全站 SSG。

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-CITE-E01 | 服务端 HTML 拼装 | `backend/src/services/h5-case-prerender.service.js`（新建） | P2 | [ ] | 与 `case-render.js` 同构 |
| GEO-CITE-E02 | Bot 路由 | `backend/src/routes/public-h5.js`；`backend/deploy/simplewin.conf` | P2 | [ ] | 复用 `$crawler_bot_type` |
| GEO-CITE-E03 | HowTo Schema | `h5/shared/case-render.js` | P2 | [ ] | 六阶段 → `HowToStep` |
| GEO-CITE-E04 | 冒烟 | `backend/scripts/h5-chain-smoke.js` | P2 | [ ] | GPTBot UA：HTML 含 `aiSummary` + JSON-LD（验机器可读，非人读交互） |

---

## 11. 指标与运维

### 11.1 北极星指标（三专项共用 · 见 [`07`](./07_GEO引用观测开发计划.md) §2.5）

| 优先级 | 指标 | 说明 | 主责 |
| ---: | --- | --- | --- |
| **P0** | `prompt_probe_citation_rate` | 词库 prompt 探测中，答案含 `geo.simplewin.cn` 链接的比例 | OBS |
| **P0** | `prompt_intent_coverage` | 已发布专题（或案例聚合）覆盖的核心 prompt 数 / 词库总数 | TOPIC + OBS |
| **P1** | `post_citation_lead_rate` | 探测周内有 citation 的 prompt 对应专题/案例页，产生的咨询+电话 / 该页 UV | OBS + 埋点 |
| **P1** | `citable_summary_rate` | 新发布案例 `ai_summary` 通过摘引自检（非模板套话）的比例 | CITE |
| **P2** | `crawler_view` | Bot 访问次数（**必要非充分**） | OBS A |

**非主指标**：`h5_case_view` 总量、页面停留时长、滚动深度（仅辅助判断引后落地页是否过涩）。

### 11.2 实施任务

| ID | 任务 | 说明 | 状态 |
| ---: | --- | --- | ---: |
| GEO-CITE-M01 | `geoEvidenceCompleteRate` | 新提交案例 stage_2 note 非空占比（**供给**） | [ ] |
| GEO-CITE-M02 | `citableSummaryRate` | 摘引自检通过 / 新发布案例 | [ ] |
| GEO-CITE-M03 | `llmAdoptionRate` | 运营采用 LLM 建议 / 审核通过 | [ ] |
| GEO-CITE-M04 | 引后转化埋点 | 案例/专题 CTA 带 `utm_medium=geo`；与 OBS 周报 join | [ ] |
| GEO-CITE-M05 | 商家看板口径 | 区分爬虫访问 vs 探测引用；**不**用 `h5_case_view` 作 GEO 成功表述 | [ ] |

---

## 12. 进度汇总

| 阶段 | 任务数 | [x] | [~] | [ ] |
| --- | ---: | ---: | ---: | ---: |
| A 节点聚合 + 闸门 | 15 | 0 | 0 | 15 |
| B 模板 + 运营编辑 | 11 | 0 | 0 | 11 |
| C LLM 文本 + diff | 13 | 0 | 0 | 13 |
| D 多模态（二期） | 5 | 0 | 0 | 5 |
| E H5 预渲染 | 4 | 0 | 0 | 4 |
| M 指标 | 5 | 0 | 0 | 5 |
| **合计** | **53** | **0** | **0** | **53** |

---

## 13. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| LLM 幻觉 | 事实溯源校验 + 运营必审 + 失败回退模板 |
| 成本 / 时延 | 仅「提交审核后」触发；异步；可配置关闭 |
| 门店抵触 block | 只拦无图无字；占位引导；预览 API 提前提示 |
| 存量案例质量参差 | 不 retroactive block；运营可 `regenerate` + LLM 补跑 |
| 多模态隐私 | 仅脱敏图；prompt 禁止输出车牌等 |

---

## 14. 关联文档

| 文档 | 关系 |
| --- | --- |
| [`docs/00_开发计划.md`](../00_开发计划.md) | 主计划；§2.6 GEO 三专项索引 |
| [`07_GEO引用观测开发计划.md`](./07_GEO引用观测开发计划.md) | 引用观测；验证成稿效果 |
| [`08_GEO意图专题开发计划.md`](./08_GEO意图专题开发计划.md) | 意图专题；案例证据的「答案层」 |
| [`08_双系统转型开发计划.md`](../01_项目总览与业务架构/08_双系统转型开发计划.md) | 双系统闭环；阶段 B 已落地生成器，本计划在其上优化 |
| [`06_案例文章与GEO字段映射.md`](../11_数据结构与状态机/06_案例文章与GEO字段映射.md) | 阶段 A15 更新真源 |
| [`.cursor/rules/zhejian-development.mdc`](../../.cursor/rules/zhejian-development.mdc) | 开发前读设计规范与 PRD |

---

## 15. 修订记录

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-06-16 | V1.0 | 初稿：节点聚合、规则 block、LLM 文本 + 二期多模态、运营 diff 必审 |
| 2026-06-16 | V1.1 | 验收哲学：AI 摘引优先；弱化人读深度；对齐三专项北极星指标 |
