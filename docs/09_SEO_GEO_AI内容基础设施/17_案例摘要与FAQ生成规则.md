# 案例摘要与 FAQ 生成规则

| 项目 | 内容 |
| --- | --- |
| 文档名称 | 案例摘要与 FAQ 生成规则 |
| 当前版本 | V1.5 · 2026-10-26 |
| 适用范围 | 公开案例详情页的 AI 摘要、页内 FAQ |
| 核心目标 | **让 AI 摘得走**——摘要与 FAQ 必须是「脱离页面仍成立」的事实句 |
| 生成方式 | **大模型生成**（两段式：先看图补图说，再一次生成摘要 + FAQ），规则只做校验与兜底 |
| 上位文档 | `04_AI可引用摘要规范.md`（通用摘要原则）· `05_FAQ生成规范.md`（证据问答口径） |
| 数据结构真源 | `docs/04_维修过程相册/26_商家端事件节点与单据节点链流程.md` §2.1 |
| 代码现状 | `case-geo-llm.service.js`（文本生成）· `case-geo-vision.service.js`（图说）· `case-geo-llm-verify.js`（事实校验）· `prompts/case-geo-optimize.md` |

> 本文只管**案例页**。服务专题页、门店页仍按 `04` / `05` 原有规范。
> 本文与 `04` / `05` 冲突时，**以本文为准**。

---

## 1. 为什么重写

一单里有七处信息，摘要原来只去「接车」「交车」两处找师傅手打的字，其余的勾选项、报价项目、施工图说一概不读；更糟的是找「方案」时去了一个 2026-09 就已经取消的旧节点（`stage_3`），等于一次都没找着。

结果就是页面上那句：

> 「……本单重点在于过程图片记录……**虽无具体故障描述或更换配件**……建议车主妥善保存这些记录。」

AI 读完不知道修了什么，无从引用。

**判断标准（一句话）**：把摘要或 FAQ 单独拎出来，脱离页面，还能不能看懂是哪台车、什么毛病、怎么修的。不能，就是不合格。

---

## 2. 数据从哪来

### 2.1 师傅在小程序里走的七步

| 序 | 显示名 | 内部 kind | 师傅录了什么 | 说人话 |
| ---: | --- | --- | --- | --- |
| 0 | 接车 | `intake` | `chiefComplaint`、里程、车型、留证照片 | 车主为啥来、车进店时什么样 |
| 1 | 检测 | `inspection` | `findings[]`：部位 + 四档结论 + 事实描述 | 查了哪儿、哪儿有问题 |
| 2 | 检测报告 | `inspection_report` | 合成主诉 + 发现项 | 给车主看的那一份 |
| 3 | 方案确认 | `quote_confirm` | 项目行（项目名、品牌、金额） | 打算怎么修、多少钱 |
| 4 | 工单 | `work` | 按方案行摊开的施工项 + 图 + 用料短名 | 实际做了什么 |
| 5 | 完工照 | `delivery_photos` | 完工照片 | 修完什么样 |
| 6 | 完工确认 | `repair_report` | 复查结论、质保、使用注意 | 交车时说了什么 |

**补充报价** = `addon_quote_confirm`（施工中新发现的问题，排在施工之后）。

### 2.1.1 存在哪、怎么取（2026-10-26 实测）

单据链存在 **`album.contentPackageJson.flowNodes`**（Prisma 列名 `content_package_json`）。

取数有**两个坑**，都是实测踩出来的：

| 坑 | 说明 |
| --- | --- |
| **工单节点没有 `document` 壳** | 工单项在 `work` 节点的 **`photoDraft.findings`**，不在 `document.payload`。`mapFlowNodeForView` 对 `work` 特判走 `mapOwnerWorkSheetCard`（`service-flow.service.js:1895`） |
| **`inspection` 会被过滤掉** | `isOwnerDocumentKind` 不认 `inspection`，所以 `buildHostContentReviewDocs` 不返回它。检测结论要取 `inspection_report`，缺了才回退 `inspection` |

**现成的读取函数 `buildHostContentReviewDocs(album, albumNodes)` 能用，但有两个短板**：
工单项的 `outsideQuote`（增项标记）会被 `mapOwnerWorkSheetLine` 丢掉；
`inspection` 节点拿不到。所以原料包走原始 `flowNodes` 解析（`utils/case-geo-factpack.js`）。

### 2.2 检测结论是结构化的

`findings[]` 每一行长这样：

| 字段 | 含义 | 示例 |
| --- | --- | --- |
| `partName` | 部位 | 右前小吊杆球头 |
| `result` | 四档结论 | 状态良好 / 需关注 / **需处理** / 仅记录 |
| `advice` | 部位上的事实 | 球头松旷，胶套开裂 |
| `caption` | 用料短名（工单步填） | 更换小吊杆 |
| `observation` | 完整观察 | 含读数、损伤范围 |
| `outsideQuote` | 是否方案外 | true / false |
| `images[]` | **这组图对应哪些图片**（每项 `{url, imageId}`） | 用于判断「这张图分析过没有」（§3.2） |

> **字段名订正（2026-10-26 实测）**：规范化后是 `images`，**不是** `imageKeys`。
> `imageKeys` 是原始草稿层（`backend/vendor/shared/utils/service-flow-docs.js`）的叫法，
> 经 `mapFlowNodeForView` 规范化后变 `images`。照 `imageKeys` 写代码取不到值。

**四档结论的取法**：只有「需处理」「需关注」喂给大模型；「状态良好」「仅记录」不喂（写进去等于刷屏）。

### 2.3 车型与诉求记在哪

- 诉求：`intake.photoDraft.chiefComplaint`（检测报告的 `payload.chiefComplaint` 是跨节点合成的同一份）
- 车型：`intake.photoDraft.vehicleBrand` / `vehicleSeries`（**品牌车系年款在新建相册页写**，不在接车步）
- 里程：`intake.photoDraft.mileageKm`

### 2.4 兼容：存量相册

老相册是六阶段（`stage_1`～`stage_6`），且存在 `intake_inspection` 合并节点。取数时**按 kind 找不到就退回 stage**：

- `intake` → `stage_1`
- `inspection` → `stage_2`
- `work` → `stage_5`
- `repair_report` → `stage_6`

---

## 3. 生成方式：两段式

### 3.1 总体流程

```
第一段 · 图说补全（多模态）
  收集所有脱敏图 → 分流（已分析过的 / 没分析过的）
  没分析过的 → 送打码图给多模态模型 → 生成一句图说
        ↓
第二段 · 摘要 + FAQ 一次生成（文本模型）
  喂全量文字原料（诉求 + 检查结论 + 报价 + 工单 + 完工 + 图说）
        ↓
  事实校验（verifyLlmDraftAgainstEvidence 扩展）
        ↓
  落库 → 商家确认 → 公开
```

### 3.2 第一段：图片分流规则（P0）

**核心原则：已经被大模型看过、有完整输出的图，不再重复送；没看过的，必须送打码图，绝不送原图。**

| 图片状态 | 判断方法 | 处理 |
| --- | --- | --- |
| **已分析过** | 该图的 key 出现在任一 `findings[].images[].url` 中，或已有非空 `caption` / `advice` | **不送图**，只把已有的 `partName` + `result` + `advice` + `caption` 作为文字带进第二段 |
| **未分析过** | 不在任何 `images` 里，且没有 `caption` | **送打码图**给多模态模型，生成一句 ≤40 字的客观图说 |

**送图范围：全部未分析的脱敏图**（老板 2026-10-26 定）。

三条硬约束：

1. **只送脱敏图**：复用 `case-geo-vision.service.js` 的 `isDesensitizedUrl`，只认路径含 `/files/uploads/desensitized/` 的 URL。原图（`uploads/YYYY/MM/`）**绝不外发**
2. **图说只描述可见事实**：「右前悬挂部位拆卸作业」这类；禁止编造车牌、价格、品牌、承诺
3. **图说复用为 ImageObject 的 `caption` 与 `alt`**，一鱼两吃（顺带解决「图注没进 AI 可读层」的老问题）

> 现状缺陷：`enrichVisionCaptions` 现在对**每张**脱敏图都调一次 `describeDesensitizedImage`，不做已分析判断，重复烧钱。必须加分流。

### 3.3 第二段：喂给大模型的原料清单

| 原料 | 取什么 | 备注 |
| --- | --- | --- |
| 城市 / 门店 / 服务项目 | `row.city` / `storeName` / `serviceName` | |
| 车型 | `vehicleBrand` + `vehicleSeries`（+ 年款） | |
| **车主诉求** | `chiefComplaint` **原文** | 可能很长，交给大模型概括，**不要截断** |
| 检查结论 | `findings[]` 中 `result` 为需处理/需关注的 `partName` + `advice` | 四档里的「状态良好」「仅记录」不喂 |
| 报价方式 | `quote_confirm` 的项目名、有无 `addon_quote_confirm` | **不喂金额**（藏价） |
| 施工内容 | `work` 工单项的 `partName` + `caption`，标注 `outsideQuote` 增项 | |
| 完工确认 | `repair_report` 的复查结论、质保、使用注意 | |
| 图说 | 第一段产出 + 已分析图的既有结果 | 带图所属节点名 |

**不喂的东西**：金额、车牌、手机号、车主姓名、原图 URL。

### 3.4 提示词约束

沿用并扩展 `prompts/case-geo-optimize.md`，保留原有五条硬约束（禁止编造 / 禁止营销 / 禁止模板套话 / 价格诚实 / 隐私），新增：

**关于摘要写法（不套死句式）**

- ❌ 不规定「因…到店，检查发现…」这种固定词序——诉求长了硬套会不通
- ✅ 只规定**信息完整性**：摘要第一句必须让人看懂「**什么车 + 主要问题**」，后面接「怎么处理的、结果如何」
- 长度 80–180 字；诉求长就概括，不要整段照抄，也不要因为长就省略关键部位

**关于 FAQ**

- 问句带上车型与项目：`【车型】【诉求或项目】这例【问法】？`
  - 例：`大众高尔夫 过减速带异响 这例做了哪些项目？`
  - 理由：AI 摘走这条后，读者仍知是哪台车（GEO 要求）；保留「这例」满足 `05` §1.1
- 答句：`这例公开档案里，【本单事实】。【对车主的叮嘱】。`，≥30 字，先事实后叮嘱
- 排序优先级（`05` §1.2）：预算 → 材料 → 避坑 → 其余过程
- 数量 2–6 条；**没有事实就返回空数组**，不凑数

### 3.5 输出格式（扩展原 JSON）

```json
{
  "aiSummary": "80-180字事实摘要，首句含车型与主要问题",
  "seoTitle": "SEO 标题，≤60字",
  "seoDescription": "SEO 描述，≤150字",
  "faq": [
    { "q": "大众高尔夫 过减速带异响 这例做了哪些项目？", "a": "这例公开档案里，…" }
  ],
  "faultDesc": "故障表现",
  "inspectResult": "检测结论",
  "repairPlan": "维修方案",
  "resultConfirm": "完工确认",
  "articleBody": "正文",
  "missingEvidence": ["stage_6"],
  "confidence": "high|medium|low"
}
```

### 3.6 事实校验（P0）

大模型输出**不得直接落库**，必须过 `verifyLlmDraftAgainstEvidence`（`case-geo-llm-verify.js`）扩展版：

1. 摘要里的部位、配件、动作，必须能在原料里找到出处，找不到 → 打回
2. 出现金额、车牌、手机号 → 打回
3. 出现模板套话（「门店根据车辆实际情况进行了检查」等）→ 打回
4. FAQ 的每一条，问答都得有原料支撑；支撑不足的条目**删除**而不是保留

校验不通过 → `llmStatus = FAILED`，保留模板兜底（现状的 `templatePayload`），不让页面开天窗。

---

## 4. 公开门槛与确认提示

### 4.1 门槛判定

生成前先判：

| 条件 | 说明 |
| --- | --- |
| 有诉求 | `chiefComplaint` 非空 |
| 有检查结论或施工内容 | `findings[]` 有需处理/需关注的行，或 `work` 有工单项 |

### 4.2 不满足时：可公开，但如实告知（老板 2026-10-26 定，同日修正）

**不硬拦**。门店确认公开时，弹窗如实说明后果与缺什么，把选择权交给门店：

```
这单记录的信息较少，公开之后：
· 不会被 AI 引用 —— 摘要里没有具体的故障、检查或施工内容，AI 读不出修了什么
· 不会被搜索引擎收录
· 车主和潜在客户看不到有效信息，等于白公开

目前缺少：
· 车主诉求（还没写）
· 检查结论（还没勾选检查项）

建议先补齐再公开。

请注意：公开之后，这一单的检查项、照片、施工内容就定格了，
现在缺的，以后补不回来。
```

**要点**：

1. 具体列出缺哪几项，不要只说「信息不足」
2. 说清后果（AI 不引用 / 不收录 / 没效果），不是警告式空话
3. **说清「定格」**：公开即冻结快照，案例事实内容不可再补（§4.3）。不留虚假的后路
4. 仍要公开时，该页 `seoNoindex = true`，且不进 `llms.txt` / Feed / sitemap

> **作废的旧文案（V1.1）**：曾写「之后补充内容，摘要和问答会自动重新生成」。
> 这句话不成立——发布时 `buildCaseSnapshot`（`public-case.service.js:530`）冻结快照，
> 公开页读快照而非读相册，补的内容进不了快照，等于白补。
> 老板 2026-10-26 指出后删除。

### 4.3 公开后还能改什么

| 内容 | 公开后 | 依据 |
| --- | --- | --- |
| 检查项 / 照片 / 施工内容（**案例事实**） | **不能改** | 发布时冻结快照，公开页读快照 |
| 摘要（**文字稿**） | **能改，改了就生效** | `saveHostedPublicCopy` 直写 `publicCase.summary`，预渲染读 `data.summary` |
| FAQ（**文字稿**） | **能改，但有条件** | `collectHostedCaseFaq` 的优先级，见下 |

**为什么改摘要 / FAQ 不用跑大模型**（老板 2026-10-26 定）：事实原料没变，改的只是措辞。
再跑一次大模型，是拿同一批原料重新措辞一遍——白花钱，还可能改出新的编造。

**改稿通道两条**：

| 通道 | 位置 | 状态 |
| --- | --- | --- |
| 运营后台 | `admin-case-article.service.js` 的 `manualFields` / `pick('aiSummary', …)` | ✅ 可用。冻结时 `assertSnapshotPayloadForbidden` 放行 `aiSummary` / `seoTitle` / `seoDescription`（`case-ops.test.js:70` 有断言） |
| 门店端 | `PUT /service-albums/:albumId/host-public-copy` → `saveHostedPublicCopy` | 摘要 ✅ / FAQ ⚠️ 见下 |

#### 改摘要：生效（老板 2026-10-26 实测验证）

链路：`saveHostedPublicCopy` → `publicCase.summary`（`case-hosting.service.js:959`）
→ `getCaseDetail` 的 `summary: row.summary`（`content.service.js:283`）
→ 预渲染 `buildBotBodyHtml` 读 `data.summary`（`h5-case-prerender.service.js:72`）。

快照层 `applySnapshotLayerToPublicCase`（`case-public-layers.js:55`）**只覆盖 `title` 与价格字段，
不覆盖 `summary`**——所以改了就生效。

> **纠错记录**：V1.2 初稿曾写「摘要改了被压住」，**是错的**。
> 当时只读了客户端 `case-render.js:739` 的 `renderArchiveLead`，漏了服务端预渲染这条主路径。
> 而**服务端预渲染才是 AI 爬虫读的那一份**，它读 `data.summary`。教训：判断「页面上显不显示」，
> 必须两条渲染路径都看（客户端 JS + 服务端预渲染），看一条就下结论会以偏概全。

#### 改 FAQ：改成和摘要一样的「覆盖」模型（老板 2026-10-26 定，**已实现**）

**原来的设计（已废弃）**：机器稿和人工稿各存一个「抽屉」，显示时按优先级排队取——
`geoLayer.faq` 排在 `hostMeta.faq` 前面，机器草稿压住人工终稿。

**现在的设计**：不排队，**直接覆盖同一个字段**，和摘要完全一致。

| | 生效稿字段 | 谁写它 | 存档（只读） |
| --- | --- | --- | --- |
| 摘要 | `publicCase.summary` | 确认公开时写机器稿；人工改时覆盖 | 快照里的 `summary` |
| **FAQ** | **`hostMeta.faq`** | 确认公开时写机器稿；人工改时覆盖 | `geoLayer.faq` |

**实现要点**：

1. `saveHostedPublicCopy` 写 `hostMeta.faq` 时**同时置 `faqOverridden: true`**
2. `collectHostedCaseFaq` 若见 `faqOverridden`，**直接返回生效稿，不再回退**——
   包括人工把 FAQ 清空的情况。清空也是明确意图，不该把机器稿又捞回来
3. `faqOverridden` **一旦置位就不再复位**：机器生成的本来就是草稿，
   让它盖掉人工终稿是错的（也避免门店二次确认时误冲掉自己的改稿）
4. 未人工改过的存量数据：保留原有回退链（`hostMeta.faq` → `hostPublicCopy.faq` →
   `contentJson.faq` → `geoLayer.faq` → `geoDraft.faq` → …），**不会开天窗**

**为什么必须现在改**：新方案（§3）要求**每一单**的 FAQ 都走大模型生成，
也就是每单的机器抽屉都是满的。旧设计下「人工改的被压住」会从偶发变成必然。

> 风险：门店可能改出带价格、夸张宣传的文案。缓解：改稿界面沿用 §3.4 的硬约束文案提示，
> 并在保存时用 `isLowInfoFaqAnswer` 之外的**金额 / 隐私正则**再兜一道（§5 第 10 项）。

#### 遗留的不一致（已一并修掉）

客户端 `renderArchiveLead` 原本是 `hostGeoLayer.summary` > `hostPublicCopy.overview`，
服务端预渲染读 `data.summary`——走过 GEO 确认的单，
**用户眼睛看到的和 AI 爬虫看到的可能不是同一句**。
现已把客户端改为 `hostPublicCopy.overview` 优先，两条路径对齐。

---

## 5. 落地清单

| # | 文件 | 改什么 |
| --- | --- | --- |
| 1 | `case-geo-llm.service.js` + 新增 `utils/case-geo-factpack.js` | ✅ **已完成**：新增纯函数 `buildCaseFactPack(flowNodes)` 把七步单据链压成原料包；`loadCaseLlmContext` 挂 `ctx.factPack`；`buildUserPrompt` 加 `facts` 块；`prompts/case-geo-optimize.md` 说明新原料与优先级 |
| 2 | `backend/src/services/case-geo-vision.service.js` | `enrichVisionCaptions` 加**图片分流**（§3.2）：已分析的跳过不送图，只未分析的送；图说复用为 ImageObject 的 `caption`/`alt` |
| 3 | `backend/src/prompts/case-geo-optimize.md` | 输出格式加 `faq[]`（§3.5）；摘要写法改成「信息完整」而非「固定句式」（§3.4） |
| 4 | `backend/src/utils/case-geo-llm-verify.js` | **两项已随第 1 项一并修**（否则第 1 项白做）：① 单据链原料进证据池——否则真料写的摘要被判「无出处」打回；② 中文整句改用包含匹配——`tokenize` 把中文整句切成单个 token，只认全等会让模型任何改写都被拦。剩余（FAQ 支撑检查、金额/隐私兜底、套话识别）待做 |
| 5 | `backend/src/utils/album-geo-extract.js` | 数据源换血（接 `chiefComplaint` / `findings[]` / 报价 / 工单），**去掉已废弃的 `stage_3`**，保留 stage 兼容回退（§2.4） |
| 6 | `backend/src/utils/case-article-templates.js` | `resolveSeoNoindex` 加事实门槛（§4.1）；模板链路降级为**兜底**，不再是主路径 |
| 7 | `backend/src/utils/merchant-case-job-faq.js` | **保留**，降级为 LLM 不可用时的兜底（§6 第 1 项已定） |
| 8 | `backend/src/utils/case-faq.js` | 清掉无调用点的百科模板死代码 |
| 9 | 商家端确认公开弹窗 | 加 §4.2 的后果提示与缺项清单（位置：发布确认页，§6 第 2 项已定） |
| 10 | `hosted-storefront-faq.js` / `case-hosting.service.js` / `h5/shared/case-render.js` | ✅ **已完成**：FAQ 改为「覆盖」模型——`saveHostedPublicCopy` 置 `faqOverridden`，`collectHostedCaseFaq` 见标记即直接返回生效稿、不回退；`renderArchiveLead` 让人工改的摘要优先，与服务端预渲染对齐 |

### 5.1 验收口径

用 `12_公开页AI可信度验收对照表.md` §4.2 的 C1–C7，加三条本文专属：

- **N1 首句自含主语**：摘出摘要第一句，应能独立回答「什么车、什么毛病」
- **N2 脱离可引用**：摘出任一 FAQ，遮住页面标题，仍知是哪台车、什么项目
- **N3 图片不外泄**：抓包确认送出去的图片 URL 全部含 `/files/uploads/desensitized/`，无原图

### 5.2 存量数据

新规则只影响**重新生成**的文章。已生成的存量用 `npm run cases:generate-articles` 补跑（或触发 LLM 重跑），补跑后抽检：确认套话页摘要变具体、缺信息的页 `noindex`。

---

## 6. 已确认结论（2026-10-26 全部关闭）

| # | 事项 | 结论 | 落地位置 |
| --- | --- | --- | --- |
| 1 | 规则引擎 FAQ 的去留 | **保留兜底**。`merchant-case-job-faq.js` 降级为 LLM 不可用时的兜底，不删（LLM 挂了不至于开天窗） | §5 第 7 项 |
| 2 | 确认公开弹窗的位置 | **商家端发布确认页**（`confirmHostedGeoPublish` 之前），不是运营后台 | §5 第 9 项 |
| 3 | 多模态模型选型 | **先不动**，继续用 `qwen3.6-plus`（`GEO_VISION_MODEL`） | — |
| 4 | 重生成触发时机 | **问题不成立，关闭**。公开后案例事实即冻结，「补内容后自动重跑 LLM」无法实现；摘要 / FAQ 的修订走人工编辑，**不重跑大模型** | §4.3 |

### 6.1 已确认结论（2026-10-26 关闭）

| # | 事项 | 结论 | 落地位置 |
| --- | --- | --- | --- |
| 5 | 人工改稿与机器生成的关系 | **不搞优先级排队，改成覆盖同一个字段**——跟摘要一模一样。人改过的就是生效稿，机器那份退化为只读存档。不加「改后过审」——一人公司扛不住审核成本；质量靠保存时的金额 / 隐私正则兜底 | §5 第 10 项（已完成） |

---

## 7. 修订记录

| 日期 | 说明 |
| --- | --- |
| 2026-10-26 | V1.0：按新业务规则（诉求驱动、七步单据链）重写；指出摘要只读 note 且读已废弃 `stage_3` |
| 2026-10-26 | V1.1：生成方式由「模板套句式」改为**大模型两段式生成**（老板定：诉求长短不定，套格式不通）；新增图片分流规则（已分析带结果、未分析送打码图，全部送）；公开门槛改为「可公开 + 充分告知后果」 |
| 2026-10-26 | V1.2：删除 §4.2 不实承诺「补内容后自动重生成」——公开即冻结快照，补不回来（老板指出）；新增 §4.3「公开后还能改什么」；§6 四项待确认全部关闭，新增第 5 项 |
| 2026-10-26 | V1.2.1 纠错：§4.3 原判「摘要改了被压住、FAQ 改了不显示」**有误**。实测确认：摘要改了**生效**（服务端预渲染读 `data.summary`，快照层不覆盖 `summary`）；FAQ 是**分情况**——只在 `geoLayer.faq` 有合格内容时被压住。根因是只看了客户端 `case-render.js`，漏了服务端预渲染这条主路径 |
| 2026-10-26 | V1.3：§6.1 第 5 项定案——**人工改稿优先于机器生成**（老板定）。不加「改后过审」，质量靠保存时的金额 / 隐私正则兜底。落地清单第 10 项明确两个改动点 |
| 2026-10-26 | V1.4：老板进一步简化——**不搞优先级排队，FAQ 直接按摘要的方式处理：人工改的覆盖同一个字段**。已实现：`saveHostedPublicCopy` 置 `faqOverridden`，`collectHostedCaseFaq` 见标记即返回生效稿不回退；`renderArchiveLead` 客户端对齐服务端。新增 4 条回归测试 |
| 2026-10-26 | V1.5：落地清单第 1 项完成（原料换血）。新增纯函数 `case-geo-factpack.js`，把七步单据链压成原料包喂给大模型。同修校验器两项：单据链原料进证据池、中文整句改包含匹配——否则真料写的摘要会被自己人拦下。订正字段 `imageKeys`→`images` |
