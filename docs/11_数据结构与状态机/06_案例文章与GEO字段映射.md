# 案例文章与 GEO 字段映射

> **生效日期**：2026-06-09  
> **任务**：DS-B-01  
> **物理真源**：`public_cases` 表 + `content_json` JSON 字段  
> **代码契约**：`backend/src/schemas/case-geo-content.schema.js` · `backend/src/constants/case-article-status.js`

---

## 1. 定位

卷六阶段 B 将服务相册审核通过的案例，生成为 **H5/GEO 可收录的文章内容**。

- **业务主键**：`public_cases.id`（案例 ID，与相册 1:1）
- **审核态**：`public_cases.status`（`pending_review` / `public_approved` 等，卷三已有）
- **文章发布态**：`public_cases.article_status`（本文件新增，与审核态分离）
- **不新建** `case_articles` / `case_content` 表；设计文档 §12 中的 `case_content`、`case_seo_meta` 逻辑合并进本表

---

## 2. 三层结构

| 层级 | 存储 | 用途 |
| --- | --- | --- |
| **L1 案例身份** | `public_cases` 已有列 | 审核、门店、价格、封面 |
| **L2 GEO 发布** | `public_cases` 新增顶列 | `<title>` / meta / AI 摘要 / 收录控制 |
| **L3 页面模块** | `content_json.geo` | H5 模块、节点叙事、图说 |

---

## 3. L2 顶列字段

| DB 列 | Prisma 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `slug` | `slug` | VARCHAR(255) NULL UNIQUE | NULL | 语义化 URL 路径段；**DS-B-06 填充**；当前 H5 仍用 `view.html?id=` |
| `seo_title` | `seoTitle` | VARCHAR(160) | `''` | SEO 标题（§07 案例生成规则 §11） |
| `seo_description` | `seoDescription` | VARCHAR(300) | `''` | SEO 描述（§12） |
| `ai_summary` | `aiSummary` | TEXT | `''` | AI 可引用摘要（`04_AI可引用摘要规范`） |
| `article_body` | `articleBody` | TEXT | `''` | 文章正文连贯段落（§7） |
| `article_status` | `articleStatus` | VARCHAR(32) | `pending` | 文章发布渠道态，见 §5 |
| `article_version` | `articleVersion` | INT | `0` | 生成版本号 |
| `article_generated_at` | `articleGeneratedAt` | DATETIME NULL | NULL | 最近一次生成时间 |
| `seo_noindex` | `seoNoindex` | TINYINT(1) | `0` | 1=允许访问但不收录 |
| `canonical_path` | `canonicalPath` | VARCHAR(512) | `''` | 规范路径，如 `/case/view.html?id=case_xxx` |

**已有 L1 列**（不变）：`title`、`summary`、`cover_image`、`content_json.nodes`、`content_json.faq`、`status`、`published_at`、价格列等。

---

## 4. L3 `content_json.geo` 结构

```json
{
  "nodes": [],
  "faq": [],
  "tags": [],
  "vehicleText": "",
  "coldStart": false,
  "geo": {
    "keyInfo": [{ "label": "城市", "value": "杭州" }],
    "faultDesc": "",
    "inspectResult": "",
    "repairPlan": "",
    "priceFactors": ["车型", "配件品牌"],
    "sections": [
      { "key": "overview", "title": "案例概况", "content": "..." }
    ],
    "nodeNarratives": [
      {
        "nodeId": "node_xxx",
        "nodeName": "旧刹车片状态",
        "description": "展示刹车片磨损情况…",
        "imageCaptions": [{ "imageIndex": 0, "caption": "…", "alt": "…" }]
      }
    ],
    "generationSource": "template",
    "generationVersion": "v1",
    "riskChecked": false
  }
}
```

**兼容**：读侧若 `geo.*` 缺失，回落 `content_json` 根级旧字段（`faultDesc`、`aiSummary` 等）；顶列 `ai_summary` 优先于 JSON。

---

## 5. `article_status` 枚举

| 值 | 含义 | 触发方（计划） |
| --- | --- | --- |
| `pending` | 尚未生成文章 | 存量默认 / 新建案例 |
| `draft` | 已生成草稿 | DS-B-03 |
| `ready` | 生成完成，待 H5 发布 | DS-B-03 |
| `published_h5` | 已在 H5 文章化发布 | DS-B-07～09 |
| `published_wechat` | 已发公众号 | DS-D |

常量：`backend/src/constants/case-article-status.js`

---

## 6. H5 模块 ↔ 存储 ↔ API

| H5 模块（`02_公开案例详情页` §5） | DB | API 字段 |
| --- | --- | --- |
| 标题 H1 | `title` | `title` |
| 案例标签 | `content_json.tags` | `tags` |
| AI 可引用摘要 | `ai_summary` | `aiSummary` |
| 关键信息表 | `content_json.geo.keyInfo` | `keyInfo` |
| 故障/需求 | `content_json.geo.faultDesc` | `faultDesc` |
| 检查结果 | `content_json.geo.inspectResult` | `inspectResult` |
| 维修方案 | `content_json.geo.repairPlan` | `repairPlan` |
| 价格影响因素 | `content_json.geo.priceFactors` + 价格列 | `priceFactors` + `price*` |
| 维修过程相册 | `content_json.nodes`（脱敏 URL） | `nodes` |
| 节点说明/图说 | `content_json.geo.nodeNarratives` | `article.nodeNarratives` |
| 正文 | `article_body` | `article.body`；根级 `articleBody` |
| FAQ | `content_json.faq` | `faq` |
| SEO TDK | `seo_title` / `seo_description` | `seo.title` / `seo.description`；根级 `seoTitle` / `seoDescription` |
| 收录控制 | `seo_noindex` / `canonical_path` | `seo.noindex` / `seo.canonicalPath` |
| 发布状态 | `article_status` | `article.status`；根级 `articleStatus` |

**读 API（DS-B-05 ✅）**：`GET /api/v1/user/cases/:id` 返回 `seo` + `article` 嵌套块及根级扁平字段。实现：`mapCaseSeoForApi` / `mapCaseArticleForApi`（`case-geo-content.schema.js`）。

---

## 7. 与 PRD `case_generated_content` 对照

| PRD §19.1 逻辑字段 | 实际落地 |
| --- | --- |
| `case_id` | `public_cases.id` |
| `title` | `public_cases.title` |
| `summary` | `public_cases.summary` |
| `body` | `public_cases.article_body` |
| `faq_json` | `public_cases.content_json.faq` |
| `seo_title` | `public_cases.seo_title` |
| `seo_description` | `public_cases.seo_description` |
| `ai_summary` | `public_cases.ai_summary` |
| `generation_source` | `content_json.geo.generationSource` |
| `version` | `public_cases.article_version` |
| `risk_checked` | `content_json.geo.riskChecked` |

---

## 8. slug 说明

- **含义**：URL 中可读的英文路径，如 `/case/hangzhou-bmw-3series-brake-case_abc.html` 中的 `hangzhou-bmw-3series-brake-case_abc`
- **canonical**：有 slug 时为 `/case/{slug}.html`；无 slug 时降级 `/case/view.html?id={case_id}`
- **DS-B-01**：仅加 `slug` 列，允许 NULL
- **DS-B-06 ✅**：审核通过 / `generate-content` 写入 `slug` + 更新 `canonical_path`（`backend/src/utils/case-slug.js`）
- **DS-B-10 ✅**：`GET /api/v1/public/h5/case-redirect?id=` 301；Nginx `view.html?id=` rewrite 至该接口；slug 页 `try_files` → `view.html`

---

## 10. 生成触发（DS-B-02 / DS-B-03）

| 时机 | 实现 |
| --- | --- |
| 运营审核通过 | `admin-case.service.js` → `approveAdminCase` → `buildCaseArticlePayload` |
| 手动补跑 | `POST /api/v1/system/cases/{caseId}/generate-content`（`force: true` 覆盖） |
| 生成器 | `backend/src/services/case-article-generator.service.js` |
| 模板 | `backend/src/utils/case-article-templates.js`（非 AI，`generationSource=template`） |

审核通过后 `article_status` → `ready`；`seo_noindex` 在缺城市/服务项目/无图时为 `true`。

---

## 11. 变更记录

| 日期 | 说明 |
| --- | --- |
| 2026-06-09 | DS-B-01 首版：字段映射 + migration `20260609120000_public_case_geo_article_fields` |
| 2026-06-09 | DS-B-02/03：审核通过触发表模板生成 + system `generate-content` |
| 2026-06-09 | DS-B-05：`GET /user/cases/:id` 返回 `seo` + `article` 块 |
| 2026-06-09 | DS-B-07～09：H5 文章化 + 本店转化 + `POST /api/v1/public/h5/leads` |
| 2026-06-09 | DS-B-06/10/11：slug + canonical + 301 redirect + H5 Schema 补全 |
| 2026-06-09 | DS-B-10 修复：`legacy=1` 防无 slug 旧链死循环 |
| 2026-06-09 | DS-B-12：`GET /merchant/public-cases/publish-panel` + 工作台案例发布区 |
