# 案例文章与 GEO 字段映射

> **当前版本**：V2.0 对齐修订  
> **物理真源**：表 `public_cases` + JSON 列 `content_json` / `enrichment_json`  
> **代码参考**：`backend/src/schemas/case-geo-content.schema.js`、`backend/src/constants/case-article-status.js`

本文单独可读：列出公开案例文章化与 GEO 相关字段、枚举与 H5 映射。不另建 `case_articles` / `case_content` 表。

---

## 1. 定位

审核通过的服务案例，生成 H5/GEO 可收录文章内容。

| 概念 | 字段/位置 |
| --- | --- |
| 业务主键 | `public_cases.id`（与 `album_id` 1:1） |
| 审核态 | `public_cases.status`（如 pending_review、public_approved） |
| 文章发布态 | `public_cases.article_status`（与审核态分离） |
| 提炼层 | `enrichment_json`（可改；不得与定稿事实矛盾） |

事实与确认件规则见《07_案例快照与提炼层字段》：公开叙述可修订另存；确认件不可静默覆盖。

---

## 2. 三层结构

| 层级 | 存储 | 用途 |
| --- | --- | --- |
| L1 案例身份 | `public_cases` 顶列 | 审核、门店、价格、封面 |
| L2 GEO 发布 | 顶列 SEO/文章字段 | title/meta、AI 摘要、收录控制 |
| L3 页面模块 | `content_json.geo` 等 | H5 模块、节点叙事、图说 |

---

## 3. L1 / L2 顶列字段

### 3.1 L1（身份与展示）

| DB 列 | 说明 |
| --- | --- |
| id / album_id | 主键与相册 |
| status | 审核态 |
| title / summary / cover_image | 标题摘要封面 |
| store_id / store_name / service_name / city | 门店与服务 |
| min_amount / max_amount / price_mode | 价格 |
| published_at | 发布时间 |
| authorization_tier | 授权档 |

### 3.2 L2（文章与 SEO）

| DB 列 | Prisma 字段 | 类型 | 说明 |
| --- | --- | --- | --- |
| slug | slug | VARCHAR(255) NULL UNIQUE | URL 路径段；可空时用 id 查询页 |
| seo_title | seoTitle | VARCHAR(160) | SEO 标题 |
| seo_description | seoDescription | VARCHAR(300) | SEO 描述 |
| ai_summary | aiSummary | TEXT | AI 可引用摘要 |
| article_body | articleBody | TEXT | 文章正文 |
| article_status | articleStatus | VARCHAR(32) | 见 §5 |
| article_version | articleVersion | INT | 生成版本 |
| article_generated_at | articleGeneratedAt | DATETIME | 最近生成时间 |
| seo_noindex | seoNoindex | TINYINT/BOOL | 1=可访问不收录 |
| canonical_path | canonicalPath | VARCHAR(512) | 规范路径 |

---

## 4. L3 `content_json.geo` 结构

```json
{
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
      "nodeName": "旧件状态",
      "description": "…",
      "imageCaptions": [{ "imageIndex": 0, "caption": "…", "alt": "…" }]
    }
  ],
  "generationSource": "template",
  "generationVersion": "v1",
  "riskChecked": false
}
```

`content_json` 根级还可含：`nodes`（脱敏过程节点）、`faq`、`tags`、兼容 `snapshot` 块。

**兼容读**：若 `geo.*` 缺失，可回落根级旧字段；顶列 `ai_summary` 优先于 JSON 内摘要。

---

## 5. `article_status` 枚举

| 值 | 含义 |
| --- | --- |
| pending | 尚未生成 |
| draft | 已生成草稿 |
| ready | 生成完成，待 H5 发布 |
| published_h5 | 已在 H5 发布 |
| published_wechat | 已发公众号 |

### 5.1 跃迁

| from | to | 触发 |
| --- | --- | --- |
| pending / draft / ready | published_h5 | 审核通过自动发布或系统补跑 |
| published_h5 | published_wechat | 运营标记 |

### 5.2 H5 可见性

列表与详情对外通常仅 `published_h5` / `published_wechat`。

---

## 6. H5 模块 ↔ 存储 ↔ API

| H5 模块 | 存储 | API 常用字段 |
| --- | --- | --- |
| 标题 H1 | title | title |
| 案例标签 | content_json.tags | tags |
| AI 摘要 | ai_summary | aiSummary |
| 关键信息表 | content_json.geo.keyInfo | keyInfo |
| 故障/需求 | geo.faultDesc | faultDesc |
| 检查结果 | geo.inspectResult | inspectResult |
| 维修方案 | geo.repairPlan | repairPlan |
| 价格因素 | geo.priceFactors + 价格列 | priceFactors + price* |
| 维修过程 | content_json.nodes（脱敏 URL） | nodes |
| 节点图说 | geo.nodeNarratives | article.nodeNarratives |
| 正文 | article_body | article.body / articleBody |
| FAQ | content_json.faq | faq |
| SEO TDK | seo_title / seo_description | seo.* |
| 收录控制 | seo_noindex / canonical_path | seo.noindex / canonicalPath |
| 发布状态 | article_status | article.status / articleStatus |

---

## 7. slug 与 canonical

- slug 示例语义：城市-车型-故障-短 id  
- 有 slug：`/case/{slug}.html`  
- 无 slug：`/case/view.html?id={case_id}`  
- 审核通过或生成内容时可写入 slug 并更新 canonical_path  
- 旧 id 链可 301 到 slug 页

---

## 8. 生成触发

| 时机 | 说明 |
| --- | --- |
| 运营审核通过 | 触发生成并常自动 `published_h5` |
| 系统补跑 | generate-content / publish-h5 / backfill |
| 生成源 | 模板规则为主（generationSource=template）；LLM 边界另见提炼层 |

缺城市/服务/无图时可将 `seo_noindex=true`。

---

## 9. 与提炼层、确认件

| 对象 | 关系 |
| --- | --- |
| enrichment_json | 可更新 FAQ/TDK/摘要；不得改确认件事实 |
| content_json.snapshot | 兼容旧块；新产品以确认件+公开稿为准 |
| 定稿相册节点 | 文章过程图文应来自定稿脱敏资源 |

---

## 10. 验收要点

1. 审核态与 article_status 分离且枚举完整。  
2. L2 顶列与 L3 geo 字段可支撑 H5 模块。  
3. 公开可见性门闸与 article_status 一致。  
4. 不依赖已删除的 case_content 表。
