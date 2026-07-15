# PublicView 与相册隐私改造计划（PV-REFORM）

> **版本**：2026-07-12 定稿  
> **状态**：实施中（Phase 1–4 代码已落地，P5 联调发版待完成）  
> **取代**：对话中「事后从全相册挑 4 张 + 每阶段双上传带 + 匿名公示档 + 原图私人分享」草案  
> **关联**：`00_Phase1_服务相册产品口径.md`（§4 待修订）、`13_案例全流程快照与GEO分层开发计划.md`、`00_开发计划.md` §7.8

---

## 1. 背景与目标

卷九快照分层落地后，公开读侧仍可能聚合 **live 相册全量节点图**。结合隐私战略与商家激励讨论，定稿如下：

| 目标 | 说明 |
| --- | --- |
| **隐私默认安全** | 公开内容在 **商家上传时** 按阶段分流，不靠事后从大池筛图 |
| **商家可理解** | **单上传口** + 阶段拍摄指引 + gate 即时反馈（不做每阶段双上传带） |
| **商家有收益** | 公示 **必须含门店名**；取消匿名公示档 |
| **车主可预期** | 授权预览 = PublicView WYSIWYG |
| **价格诚实** | 公示方案来自 **结构化字段**；报价单图仅私密留档 |

---

## 2. 产品定稿（四点意见）

### 2.1 取消匿名公示

| 档位 | 说明 |
| --- | --- |
| **不公开**（默认） | 完整留档仅在小程序内 |
| **授权公示** | PublicView 轻量包 + **必须展示门店名称**；上 H5 / Feed / GEO |

废止：`authorizationTier = anonymous` 的新增写入；存量 anonymous 案例运营批量下线。

### 2.2 取消原图私人分享

- 微信好友 / 复制链接：**仅脱敏图** + 私密 token  
- 完整原图：**仅在小程序内**（车主/商家登录态）  
- 废止：`album-share` 的 `mode=original`、`share_raw` 授权类型的新增留痕  

### 2.3 单上传 + 阶段自动分流（非双区 UI）

商家每个阶段仍 **一个「添加照片」**；系统按 **阶段策略 + publicGate 检测** 写入 `album_images.visibility`：

| 阶段 | 商家提示（一行） | 图默认策略 |
| --- | --- | --- |
| stage_1 接车 | 本阶段仅留档，不会进入公示 | `always_private` |
| stage_2 检测 | 建议损伤近景；含车牌全景仅留档 | `gate` |
| stage_3 方案 | 报价单仅留档；公示展示方案文字与金额 | `always_private`（图） |
| stage_4 配件 | 建议零件/包装特写 | `gate` |
| stage_5 施工 | 建议施工细节 | `gate` |
| stage_6 交付 | 建议修复局部，避免整车外观 | `gate` |

**gate 通过** → `visibility=public`；**含 plate/vin/face/phone/document** → `visibility=private` + Toast 说明（**不阻断 save**）。

### 2.4 文案体检（保存 / 完工时）

- **规则层**：PII、过短、模板句、绝对化用语、公开图无说明、jargon 密度  
- **LLM 层**（可选）：仅 **scrub 后文本** → 评分 + 修改建议；**不自动改稿**  
- **弱拦**：含 PII / 绝对化 → block 级；可私密完工  
- **公示引导**：缺 `planAmount` 与 stage_3 说明时强提示「公示后将无方案/报价信息」

---

## 3. PublicView 数据模型

### 3.1 album_images 扩展

```text
visibility          private | public
publicGateStatus    pending | passed | rejected | skipped
publicGateReason    plate_detected | document | stage_private_only | ...
publicGateCheckedAt   DateTime?
```

### 3.2 snapshot.publicView

授权提交时写入 `content_json.snapshot.publicView`：

```json
{
  "version": 1,
  "authorizationTier": "named",
  "storeName": "…",
  "media": [
    { "nodeId": "stage_4", "idx": 0, "maskedUrl": "…", "caption": "…" }
  ],
  "facts": {
    "faultDesc": "…",
    "inspectResult": "…",
    "repairPlan": "…",
    "resultConfirm": "…"
  },
  "price": { "priceMode": "fixed", "amount": 1280 }
}
```

**读侧约束**：H5 / Feed / `content.service` **只读 `publicView`**；禁止 fallback 到 live 全量 `nodes` 或 `rawUrl`。

### 3.3 media 数量

- **取消固定 4 张上限**  
- `media` = 所有 `visibility=public` 且 `gate=passed` 且 pre-mask 成功的图，按 stage + idx 排序  
- **软上限 30 张**（H5 性能 / 审核台；Feed 封面仍 pick 1 张）  
- stage_1 / stage_3 的图 **永不进入 media**

### 3.4 stage_3 方案与报价

| 来源 | 进 PublicView 文本 | 进 PublicView 图 |
| --- | --- | --- |
| `album_nodes.stage_3.note` | ✅ scrub 后 | ❌ |
| `albums.planPartsJson`（行项名/类型） | ✅ scrub 后 | ❌ |
| `albums.planAmount` | ✅ | ❌ |
| stage_3 报价单照片 | ❌ | ❌ |

**报价单不 OCR 上网**。可选 **商家端 OCR 辅助录入**（私密）：触发 OCR → 填入 `planParts` / `planAmount` → 商家核对保存 → 文本进 PublicView。

若商家仅上传报价单图、不手填也不 OCR：

- 允许 **私密完工**  
- 文案体检提示缺方案信息  
- 授权预览 **弱拦**（仍可继续）  
- H5 价格可能为 `consult`；`repairPlan` 为空或弱模板  

---

## 4. 技术实现要点

### 4.1 阶段策略常量

`backend/src/constants/album-public-visibility-policy.js`

### 4.2 publicGate 检测

`backend/src/services/public-gate.service.js` — 封装 `detectSensitiveRegions`（detect-only，不必先写 masked 文件）。

触发时机：`syncAlbumNodes` 对 **新增 URL** 且 policy=`gate` 的图。

### 4.3 buildPublicView

`backend/src/services/build-public-view.service.js`

- `media`：过滤 public + passed + maskedUrl  
- `facts.repairPlan`：`buildPublicRepairPlan()`（note + planParts + planAmount，不含图）  
- `scrub-pii-text.js`：note / planParts / caption 共用  

### 4.4 单据 OCR 定位（报价 / 定损 / 结算）

- UI 文案：**「OCR 辅助录入」**（非「AI 智能解析」）
- 覆盖单据：**报价单、定损单、结算单**
- 触发前：**商家端明示同意**（提交阿里云 OCR，仅辅助填表）
- 生产 `PLAN_QUOTE_LLM_ENABLED=false`（不默认 VL 通读原图）
- OCR 结果只写结构化字段 / 节点说明草稿，**不上传单据图到公开页或通用大模型写专题**
- 隐私政策与《商家服务协议》须披露第三方 OCR 用途（见 `10_隐私协议与授权规则.md` §17）

### 4.5 回滚

Feature flag `PUBLIC_VIEW_V2`：关闭时 H5 只读旧 snapshot 结构（只读兼容，Phase 2 实现）。

---

## 5. 分阶段实施

### Phase 0 · 口径与合规止损（3 工作日）

| ID | 任务 |
| --- | --- |
| PV-P0-DOC | 修订 `00_Phase1_服务相册产品口径.md` §4、§4.5.4；同步隐私协议 / `authorization-legal.js` |
| PV-P0-ENV | 生产关闭报价 VL 读原图、AI Vision 读原图（env 清单） |

**里程碑**：口径评审通过；生产无原图进 LLM/VL。

---

### Phase 1 · 单上传自动分流 + gate（7 工作日）

| ID | 任务 |
| --- | --- |
| PV-P1-B-01 | `album_images` migration（visibility / gate 字段） |
| PV-P1-B-02 | `album-public-visibility-policy.js` + `public-gate.service.js` |
| PV-P1-B-03 | `syncAlbumNodes` 打标；save 响应返回 `imageGateResults` |
| PV-P1-M-01 | 商家 edit：阶段拍摄指引（扩 `template-stage-meta`） |
| PV-P1-M-02 | save 后 gate Toast / 角标 |
| PV-P1-T | 单测：stage_3 图 skipped；stage_4 含 plate → rejected |

**里程碑**：商家单上传；stage_3 图全 private；stage_4 gate 可测。

---

### Phase 2 · PublicView 读侧（6 工作日）

| ID | 任务 |
| --- | --- |
| PV-P2-B-01 | `buildPublicView` + `scrub-pii-text.js` |
| PV-P2-B-02 | 授权写 `snapshot.publicView`；`public-case.service` 改造 |
| PV-P2-B-03 | `content.service` / H5 只读 publicView；`PUBLIC_VIEW_V2` flag |
| PV-P2-U-01 | 车主授权预览：仅 public 池 WYSIWYG |
| PV-P2-T | 冒烟：公网响应无 rawUrl、无 stage_3 图 |

**里程碑**：H5 读 PublicView；media 无 4 张上限。

---

### Phase 3 · 文案体检 + 报价 OCR 辅助（5 工作日）

| ID | 任务 |
| --- | --- |
| PV-P3-B-01 | `copy-quality.service`（规则层） |
| PV-P3-B-02 | 可选 LLM 建议（scrub 文本 only） |
| PV-P3-B-03 | stage_3 缺字段强提示；授权预览弱拦 |
| PV-P3-M-01 | 保存/完工文案体检 UI + 采纳建议 |
| PV-P3-M-02 | 报价入口改「OCR 辅助录入」 |

**里程碑**：缺方案信息有明确提示；OCR 只填表不上网。

---

### Phase 4 · 取消匿名档与原图分享（4 工作日）

| ID | 任务 |
| --- | --- |
| PV-P4-U-01 | 授权页：仅「授权公示（含门店名）」/ 不公开 |
| PV-P4-U-02 | ShareSheet 去掉原图；仅脱敏分享 |
| PV-P4-B-01 | 删除 `mode=original`、anonymous 新写入；移除 `share_raw` 新留痕 |
| PV-P4-OPS | 存量 anonymous 案例下线脚本 |

**里程碑**：新授权仅 named；分享无原图。

---

### Phase 5 · 联调验收与发版（3 工作日）

| ID | 任务 |
| --- | --- |
| PV-P5-1 | 全链路：上传 → gate → 文案体检 → 完工 → 授权 → 审核 → H5 |
| PV-P5-2 | `privacy-desensitization-check` + `case-snapshot-check` |
| PV-P5-3 | `release-checklist` |

**里程碑**：2026-08-21 前发版（见 §6）。

---

## 6. 排期

假设 1 后端 + 1 小程序，部分并行。

| 阶段 | 日历 | 工作日 | 里程碑 |
| --- | --- | ---: | --- |
| Phase 0 | 7/14 – 7/16 | 3 | 口径 + env |
| Phase 1 | 7/17 – 7/25 | 7 | gate + 自动分流 |
| Phase 2 | 7/28 – 8/4 | 6 | PublicView 读侧 |
| Phase 3 | 8/5 – 8/11 | 5 | 文案体检 + OCR 填表 |
| Phase 4 | 8/12 – 8/15 | 4 | 匿名/原图回改 |
| Phase 5 | 8/18 – 8/20 | 3 | 发版 |

**合计约 28 个工作日（~6 周）**

```text
依赖：P0 → P1 → P2 → P5
           └→ P3 ──┘
      P0 → P4（可与 P2 尾段并行）
```

---

## 7. 验收清单

1. stage_3 报价单图：私密可见，PublicView 无图；有 planAmount/note 则有文本。  
2. stage_4/5/6 gate 通过图：**全部**进 publicView.media（≤30 软上限）。  
3. 授权仅 named + 门店名；anonymous 不再新增。  
4. 私人分享仅脱敏；无 `mode=original`。  
5. 仅上传报价单、不手填：文案体检提示；授权预览弱拦；H5 可无一口价。  
6. H5/Feed 无 rawUrl；不读 live 全量 nodes。  
7. 生产无 VL 读报价原图。

---

## 8. 与已实施 P0 的关系

| 已做 | 本计划 |
| --- | --- |
| 先扫码 + 未关联禁传 | **保留** |
| `album_processing` 同意 | **保留** |
| `share_raw` 留痕 | **Phase 4 删除** |
| AI consent 文案 | **保留** |

---

## 9. 版本记录

| 日期 | 说明 |
| --- | --- |
| 2026-07-12 | 初稿：四点意见 + 单上传分流 + 无 4 张上限 + stage_3 文本路径 + OCR 辅助填表 |
| 2026-07-12 | 增补 §10 落地规范：skills 矩阵、后端/样式一致性、Phase 门禁 |

---

## 10. 落地规范（skills · 一致性 · 门禁）

> **强制**：每个 Phase 开工前 Read 对应 skill 全文；Phase 结束跑对应检查 skill（默认只报告；用户明确要求再改代码）。

### 10.1 开发前必读（全员）

| 文档 | 用途 |
| --- | --- |
| `docs/00_设计规范/00_辙见平台设计体系.md` | 八原则、价格四型、合规标签 |
| `docs/00_设计规范/01_设计令牌_tokens.md` + `styles/tokens.wxss` | 样式唯一真源 |
| `docs/00_设计规范/02_组件API规范.md` | 复用 Button/Tag/Card/Empty 等 |
| `docs/04_维修过程相册/00_Phase1_服务相册产品口径.md` | 与本计划冲突时 **先修订口径再写码** |
| `docs/04_维修过程相册/13_案例全流程快照与GEO分层开发计划.md` | snapshot / enrichment 边界 |

### 10.2 Phase × Skill 矩阵

| Phase | 主编排 skill | 实现 skill | Phase 结束检查 |
| --- | --- | --- | --- |
| **P0 口径** | — | — | 人工口径评审 |
| **P1 gate + 分流** | `case-snapshot-flow` | `api-integration`（save 响应 gate 字段） | — |
| **P1 商家 UI** | — | `component-api-implementation`（若有新组件）；`wxss-refactor` | `design-system-check` |
| **P2 PublicView** | **`case-snapshot-flow`** | **`case-snapshot-engine`**（snapshot 写/读路径） | **`case-snapshot-check`** |
| **P2 H5/读侧** | `case-snapshot-flow` | `api-integration` | `privacy-desensitization-check` |
| **P3 文案体检** | — | `api-integration`；LLM 须对齐 `case-enrichment-geo` 文本边界 | `price-compliance-check`（planAmount 展示） |
| **P4 授权/分享** | `case-snapshot-flow` | `api-integration` | `privacy-desensitization-check` |
| **P5 发版** | **`release-checklist`** | 汇总下列全部 | 见 §10.4 |

**相册商家页**（`packageMerchant/pages/album/*`）：开工 Read `merchant-workbench-scaffold` §7（相册仍走卷一 A-*，但 UI 线框/工具页壳与 M-WB 一致）。

**脱敏/gate**：复用 `backend/src/services/desensitize-engine/`，不新建平行检测栈；专项调试用 `desensitize-plate-debug`。

### 10.3 一致性约束（写码时必须遵守）

#### 后端

| 项 | 约定 |
| --- | --- |
| **服务层** | 新逻辑进 `backend/src/services/*.service.js`；常量进 `backend/src/constants/` 或 `constants/` 双端共享 |
| **路由** | 商家 `merchant-service-albums.js`；用户 `user-service-albums.js`；不改 URL 风格 |
| **错误码** | HTTP status + 中文 `message`；gate rejected **不 409**（save 成功，仅标记 private） |
| **媒体** | 继续 `assertPersistentImageUrl` / `resolvePublicCaseMediaUrl`；PublicView **禁止** rawUrl |
| **快照** | `publicView` 写入 `content_json.snapshot`；**不**改 enrichment 数字事实；授权后 merchant save 仍 **409** |
| **共享常量** | 改 `constants/` 时同步 `backend/vendor/shared/constants/`（compliance、legal 等同源） |
| **测试** | 新 service 补 `*.test.js`（参照 `case-snapshot.test.js`、`case-public-layers.test.js`） |
| **Feature flag** | `PUBLIC_VIEW_V2` 读侧切换；与 `config` 模式一致 |

#### 小程序 · 样式与组件

| 项 | 约定 |
| --- | --- |
| **Token** | 仅用 `styles/tokens.wxss` 变量与工具类；**禁止**页面 WXSS 散落色值（`#fff`/`transparent` 除外） |
| **组件** | 提示/空态/按钮用 `components/` 已有能力；**禁止**页面内复制卡片/标签样式 |
| **商家相册** | 延续 `merchant-album-edit` 现有布局；gate Toast 用 `ui-tag` / 现有 caption 样式 |
| **新组件** | 须先 Read `component-api-implementation` + 更新 `02_组件API规范.md` |
| **合规文案** | 从 `constants/compliance-copy.js`、`merchant-legal.js` 引用，不散落字符串 |

#### 价格与 OCR

| 项 | 约定 |
| --- | --- |
| **公开价** | 统一 `backend/src/utils/album-price.js` + 前端 mirror；授权 named → fixed |
| **报价 OCR** | UI「OCR 辅助录入」；生产关 VL；复用 `plan-quote-ocr.service.js` + `plan-quote-parse` |
| **检查** | Phase 3/5 跑 `price-compliance-check` |

### 10.4 Phase 5 发版门禁（`release-checklist` 必跑子项）

1. **`case-snapshot-check`** — publicView 只读、无 drift、409 锁定  
2. **`privacy-desensitization-check`** — 无 rawUrl 公开、无原图分享、审核台无原图  
3. **`design-system-check`** — 改动过的商家/用户相册页  
4. **`component-usage-review`** — 若新增 gate 提示 UI  
5. **`price-compliance-check`** — H5/授权预览价格  
6. **`wxss-refactor`** — 新增 WXSS 无硬编码色值  

### 10.5 单 Phase 落地流程（Agent / 人工统一）

```
1. Read 本计划对应 Phase + §10.2 skill 矩阵
2. Read 必读 PRD/口径（§10.1）
3. 输出：涉及文件清单 + snapshot/publicView 边界说明（≤15 行）
4. 实现（最小 diff；匹配周边命名与抽象层级）
5. 跑 Phase 结束检查 skill → 修复阻塞项
6. 更新 docs/00_开发计划.md §7.8 对应任务 [ ]→[x]
```

### 10.6 与卷九的边界（避免重复建设）

| 已有（卷九） | PV-REFORM 扩展 |
| --- | --- |
| `CaseSnapshot` 冻结时机 | 增加 `snapshot.publicView` 子对象 |
| `GeoEnrichment` 可变 | **不得**改 publicView 内 facts/price |
| pre-mask 任务链 | publicGate **前置**于 pre-mask（分流 vs 脱敏） |
| `case-geo-extract` | `buildPublicRepairPlan` 在其上 **排除 stage_3 图** |

变更 public-case / content.service / H5 case-render 时，**必须先** `case-snapshot-flow` 出计划，再动代码。

---

## 11. 用户授权公示 · 公示就绪评估（2026-07-12）

> **决策**：完工时输出 **综合分 + 改善建议**；**方案 B**：均分 ≥ 70 且无 block 方可引导授权公示；不拦完工、不拦查看/分享。

### 11.1 门槛规则（方案 B）

| 字段 | 含义 |
| --- | --- |
| **publicCaseScore** | 质量分：geo 证据链分 + 文案质量分（**不含**隐私 block 扣分）均分，0–100 |
| **publicCaseScorePass** | **无隐私/合规硬项** 且 质量分 ≥ **70** |
| **publicCasePrivacyPass** | 无隐私/合规一票否决项 |
| **privacyBlocks** | 隐私/合规硬项（文案 PII、绝对化承诺、图 gate 隐私导致无公示素材） |
| **qualitySuggestions** / **publicCaseSuggestions** | 质量改善建议（证据链、文案 weak 项） |

- **隐私/合规硬项** 一票否决，**不计入质量分**
- **weak** 质量建议只影响质量分与文案，不单独作为硬项（除已计入 privacyBlocks 者）
- 商家 **完工** 弹「公示就绪评估」（得分 + 建议），**不拦完工**
- 用户端：`publicCaseScorePass === false` 时 **不展示**「授权公示」；查看/分享不受影响
- 后端 authorization / public-case / authorize-preview **409** 与 UI 一致

### 11.2 API 字段

`publicCaseScore`、`publicCaseScorePass`、`publicCaseScoreThreshold`、`publicCaseSuggestions`、`publicCaseScoreSummary`；兼容 `publicCaseQualityReady`（同 pass）。细分 `geoQuality` / `copyQuality` 供商家编辑参考。

### 11.3 H5 JSON-LD（保留实体信号，无数值分）

`Article.additionalProperty` 仍输出实体互链字段（`contentType`、`snapshotVersion`、`sourceAlbumId` 等），**不含**汇总数值分。

### 11.4 运营台

- 沿用 **geoQuality**（CaseGeoEditor）与商家侧评估弹窗
- 审核不因汇总分强制 noindex；收录策略仍走套餐/城市规则
