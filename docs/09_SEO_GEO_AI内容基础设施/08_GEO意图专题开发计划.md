# GEO 意图专题开发计划

> **生效日期**：2026-06-16  
> **状态**：定稿 · **A～D + T/M/F 已验收**（2026-06-19）；**G 信息增量** 见 [`09_GEO信息增量与RAG专线开发计划.md`](./09_GEO信息增量与RAG专线开发计划.md)；下一项 **GEO-IGAIN A/B（P0）**
> **与主计划关系**：独立专项；进度在本文件勾选；完成后更新 [`docs/00_开发计划.md`](../00_开发计划.md) §2.6。  
> **战略定位**：**案例 = 证据，专题 = 答案**；对标 Profound「Prompt 选题」+ 国内 GEO「结构化语料 / 知识页」，用 **真实案例聚合** 做差异化。  
> **关联专项**：[`06_GEO案例引用优化开发计划.md`](./06_GEO案例引用优化开发计划.md)（案例成稿）· [`07_GEO引用观测开发计划.md`](./07_GEO引用观测开发计划.md)（gap 驱动选题）

---

## 1. 文档信息

| 项目 | 内容 |
| --- | --- |
| 文档名称 | GEO 意图专题开发计划 |
| 当前版本 | V1.4 |
| 适用范围 | GEO 专题数据模型、H5 `/topic/`、运营台、案例页 FAQ、内链矩阵 |
| 不在范围 | 小程序 GEO Tab 恢复、车型独立站 `DS-C-06` 全量、虚假「AI 排名」内容 |
| 任务 ID 前缀 | `GEO-TOPIC-*` |

### 1.1 进度标记

同 [`07_GEO引用观测开发计划.md`](./07_GEO引用观测开发计划.md) §1.1。

---

## 2. 问题与目标

### 2.1 现状

| 已有 | 缺口 |
| --- | --- |
| H5 `/topic/{slug}`、`h5-geo-topic.service.js`、`topic-render.js` | 专题数据部分依赖 `mock/geo-pages`，与真实案例库联动弱 |
| `B-CONTENT-06`：`GET /user/geo-pages*` | 页内 FAQ 多为空或外链；**无 `FAQPage` Schema** |
| 公开案例详情 | FAQ 区块为公众号 `ItemList`，非页内问答 |
| `DS-C-06` 车型聚合 | 搁置；长尾「车型+故障」意图未覆盖 |
| 案例内链 | `DS-C-11` 已有基础 | 案例 → 专题 → 服务 矩阵未产品化 |

### 2.2 目标（一句话）

建设 **50～200 个高意图 GEO 专题页**，用 **页内 FAQ + ai_summary** 直接回答 AI prompt；案例作 **附录证据**，不指望用户通读。

### 2.2.1 懒人用户与页面形态（2026-06-16）

| 原则 | 说明 |
| --- | --- |
| **专题 > 案例详情** | 用户问 AI 一句；AI 更常引 **问答型专题**，而非六阶段长页 |
| **首屏即答案** | 专题 H5：`ai_summary` + 3～5 条 FAQ + 相关案例卡片（可选展开）+ CTA |
| **案例角色** | 证明「有据可查」；可折叠为「脱敏案例证据」区，**不**要求用户翻阅 |
| **验收** | `prompt_intent_coverage`、专题 URL 的 `prompt_probe_citation_rate`（见 [`07`](./07_GEO引用观测开发计划.md) §2.5） |

### 2.3 页面类型（对齐 `09_GEO内容页.md` §3）

| 类型 | URL 示例 | 优先级 |
| --- | --- | ---: |
| 城市+服务 | `/topic/hangzhou-brake-pad` | P0 |
| 故障问答 | `/topic/brake-noise-what-to-check` | P0 |
| 城市+故障 | `/topic/hangzhou-ac-not-cold` | P1 |
| 车型+服务 | `/topic/bmw-3-brake-case` | P1（轻量，非全站车型库） |
| 案例聚合 | `/topic/hangzhou-accident-case` | P2 |

### 2.4 产品原则

1. **每个专题至少绑定**：摘要、适用场景、价格影响因素、≥1 相关脱敏案例（或显式「案例筹备中」+ noindex）。
2. **页内 FAQ** 与可见内容一致，可进 `FAQPage` Schema；公众号外链作「延伸阅读」，不替代页内 Q&A。
3. **不编造**：FAQ 答案来自案例聚合、服务 PRD、运营审核；无案例支撑则写「需到店检测」类合规表述；**禁止**长期仅使用 `geo-faq-templates` 通用答案而无案例统计（见 [`09_GEO信息增量与RAG专线开发计划.md`](./09_GEO信息增量与RAG专线开发计划.md)）。
4. **专题由运营创建 + 半自动推荐**（[`07`](./07_GEO引用观测开发计划.md) gap 列表）。
5. **为人只看摘要**：专题页信息架构对齐 **答案页**，不对齐「内容社区」；过程证据下沉、可折叠。
6. **标准服务 = 服务项目页**（2026-06-16）：GEO 能力（`ai_summary`、页内 FAQ、`FAQPage`）落在 **`/service/{slug}.html`**；`geo_pages` 作运营可编辑层合并进服务 API；**`/topic/` 仅作兼容跳转**，不再独立渲染。

---

## 3. 内容模型

### 3.1 存储方案（推荐）

**阶段 A**：扩展 `geo_pages` 表（或等价 CMS 表），替代 mock 只读。

| 字段 | 说明 |
| --- | --- |
| `id`, `slug`, `title`, `summary` | 基础 |
| `page_type` | city_service / fault_qa / city_fault / vehicle_service / case_agg |
| `city`, `service_id`, `fault_tag`, `vehicle_series` | 意图维度 |
| `scenarios[]`, `price_factors[]` | 适用场景与价格因素 |
| `faq[]` | `{ question, answer }` 页内问答 |
| `faq_links[]` | `{ title, url }` 公众号延伸（可选） |
| `related_case_ids[]` | 人工或规则挂载 |
| `seo_title`, `seo_description`, `ai_summary` | GEO 顶栏 |
| `status` | draft / published / noindex |
| `published_at`, `updated_at` | 收录 |

### 3.2 与案例的关系

```text
public_cases (published_h5)
    ↓ 规则匹配 / 运营挂载
geo_pages.related_cases
    ↓ 渲染
H5 专题「相关案例」+ 案例页「延伸专题」内链
```

---

## 4. 阶段划分总览

| 阶段 | 名称 | 优先级 | 依赖 | 产出 | 状态 |
| --- | --- | ---: | --- | --- | ---: |
| **A** | 专题入库（去 mock）+ 运营 CRUD | P0 | 无 | 真库驱动 `geo_pages` | [x] |
| **B** | 页内 FAQ + FAQPage Schema | P0 | A | AI 可引用的问答块 | [x] |
| **C** | 案例↔服务页矩阵 + 自动挂载 | P1 | A、[`06`](./06_GEO案例引用优化开发计划.md) | 内链密度 | [x] |
| **D** | 意图模板批量生成 + 首批 30 种子 | P1 | A、B | 种子内容网 | [x] |
| **E** | 车型+服务轻量专题 | P2 | C | 覆盖 `DS-C-06` 子集 | [ ] |
| **F** | llms.txt / 专题 Feed | P2 | A | 可选发现层 | [x] |

**推荐顺序**：`A → B → D` ✅ → `C` ✅ → **GEO-OBS B**（验 citation）→ `E/F`（按需）。

---

## 5. 阶段 A · 专题入库 + 运营 CRUD（P0）

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-TOPIC-A01 | 数据模型 | `backend/prisma/schema.prisma`；migration | P0 | [x] | `geo_pages` 表 |
| GEO-TOPIC-A02 | 读 API 改造 | `backend/src/services/geo.service.js` | P0 | [x] | 读 DB；移除生产 mock 依赖 |
| GEO-TOPIC-A03 | H5 payload | `backend/src/services/h5-geo-topic.service.js` | P0 | [x] | 相关案例走 `content.service` 真库 |
| GEO-TOPIC-A04 | 运营 CRUD API | `backend/src/routes/admin.js`；`admin-geo-page.service.js`（新建） | P0 | [x] | 创建/编辑/发布/下架 |
| GEO-TOPIC-A05 | 运营台列表/编辑 | `admin-web/src/views/geo-pages/*`（新建） | P0 | [x] | 类型、城市、服务、FAQ、挂载案例 |
| GEO-TOPIC-A06 | mock 迁移脚本 | `backend/scripts/geo-pages-migrate-from-mock.js`（新建） | P0 | [x] | 现有 `mock/geo-pages` → DB |
| GEO-TOPIC-A07 | sitemap | `backend/src/services/h5-sitemap.service.js` | P0 | [x] | `published` 专题入 sitemap |
| GEO-TOPIC-A08 | 冒烟 | `backend/scripts/h5-chain-smoke.js` | P0 | [x] | topic 读真库 |
| GEO-TOPIC-A09 | 文档 | `docs/11_数据结构与状态机/02_核心数据对象.md` | P1 | [x] | GeoPage 对象 §7.6 |

### 5.1 阶段 A 验收

1. 生产 `GET /user/geo-pages` 无 mock 兜底。
2. 运营台可创建并发布 1 条专题，H5 `/topic/{slug}` 可访问。
3. 每条已发布专题在词库中有 **≥1 条映射 prompt**（`geo_prompt_probe.topic_id` 或配置表），供 OBS 算覆盖率。

---

## 6. 阶段 B · 页内 FAQ + Schema（P0）

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-TOPIC-B01 | FAQ 数据契约 | `backend/src/schemas/geo-page.schema.js`（新建） | P0 | [x] | `faq: {q,a}[]` 校验 |
| GEO-TOPIC-B02 | H5 渲染 | `h5/shared/topic-render.js` | P0 | [x] | **首屏**：summary + FAQ；案例区可折叠；延伸阅读分开展示 |
| GEO-TOPIC-B03 | FAQPage Schema | `topic-render.js` | P0 | [x] | 与可见 FAQ 一致 |
| GEO-TOPIC-B04 | 案例页 FAQ 扩展 | `public_cases.content_json.faq`；[`06`](./06_GEO案例引用优化开发计划.md) | P1 | [x] | 支持内联 `{q,a}` + 外链并存 |
| GEO-TOPIC-B05 | 案例 H5 | `h5/shared/case-render.js` | P1 | [x] | 内联 FAQ → `FAQPage`；外链仍 `ItemList` |
| GEO-TOPIC-B06 | 运营 FAQ 编辑器 | `admin-web` CaseFaqEditor / GeoPage 表单 | P1 | [x] | Tab：页内问答 / 公众号链接 |
| GEO-TOPIC-B07 | FAQ 种子模板 | `backend/src/constants/geo-faq-templates.js`（新建） | P1 | [x] | 按 `page_type` + `service_id` 给合规初稿 |
| GEO-TOPIC-B08 | 规范对齐 | `docs/09_SEO_GEO_AI内容基础设施/05_FAQ生成规范.md` | P1 | [x] | 页内 FAQ 与案例 FAQ 区分 |

### 6.1 阶段 B 验收

1. 专题页 View Source 含 `FAQPage` JSON-LD。
2. FAQ 答案不含营销禁词；无案例时答案含「以到店检测为准」。
3. 首屏无需滚动即可看到 **摘要 + 至少 1 条 FAQ + 咨询/电话 CTA**。

---

## 7. 阶段 C · 案例↔服务页矩阵（P1）

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-TOPIC-C01 | 匹配规则 | `backend/src/utils/geo-topic-matcher.js` | P1 | [x] | case.city + serviceName + tags → 服务页 / geo_pages |
| GEO-TOPIC-C02 | 案例发布自动挂载 | `case-article-publish.service.js` | P1 | [x] | 写入 `related_case_ids`（可人工解绑） |
| GEO-TOPIC-C03 | 案例内链 | `backend/src/utils/case-internal-links.js` | P1 | [x] | 优先 `/service/{slug}.html?city=` |
| GEO-TOPIC-C04 | H5 案例延伸 | `h5/shared/case-render.js` | P1 | [x] | 「相关服务说明」模块 |
| GEO-TOPIC-C05 | 服务页相关案例 | `h5-service-item.service.js` | P1 | [x] | geo_pages 人工排序 + 规则；最少 1 条才 index |
| GEO-TOPIC-C06 | 运营批量挂载 | `admin-geo-page.service.js` | P2 | [ ] | 按城市+服务批量关联案例 |

---

## 8. 阶段 D · 首批意图专题（P1）

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-TOPIC-D01 | 专题生成器 | `backend/src/services/geo-page-generator.service.js` | P1 | [x] | 从服务库+城市生成 draft |
| GEO-TOPIC-D02 | 首批清单 | `backend/src/constants/geo-topic-seed-list.js` | P1 | [x] | 30 条；**每条绑定 prompt 词库 ID**（对接 OBS） |
| GEO-TOPIC-D03 | 导入脚本 | `npm run geo:seed-topics` | P1 | [x] | 生成 draft，运营审核后发布 |
| GEO-TOPIC-D04 | ai_summary 模板 | 复用 `geo-page-generator` + `geo-faq-templates` | P1 | [x] | 服务页顶栏摘要 |
| GEO-TOPIC-D05 | 首页/城市页入口 | `home.service.js`；`h5-city.service.js` | P1 | [x] | 展示意图页（排除 service_base） |
| GEO-TOPIC-D06 | 搜索收录 | `content.service` search | P1 | [x] | geoPages 来自 DB；**2026-06-19** 修复 `search-match` 导入 |

### 8.1 阶段 D 验收

1. 首批 **30** 条专题 `published` 且 sitemap 可发现。
2. `prompt_intent_coverage` ≥ **40%**（词库 20+ 条前提下，见 [`07`](./07_GEO引用观测开发计划.md) §2.5）。
3. 抽 5 条专题在 OBS 探测中 **mention 或 citation** 至少出现 1 次（8 周窗口内，作方向性信号非合同承诺）。

### 8.2 首批 30 专题示例方向（运营可调整）

| 类型 | 示例 slug |
| --- | --- |
| 城市+服务 | `hangzhou-brake-pad`、`shanghai-ac-service` |
| 故障问答 | `brake-noise-causes`、`ac-not-cold-checklist` |
| 城市+故障 | `hangzhou-brake-noise`、`hangzhou-battery-dead` |

---

## 9. 阶段 E · 车型+服务轻量专题（P2）

> 不全做车型库；仅当某车系案例数 ≥N 时自动生成专题。

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-TOPIC-E01 | 车系聚合统计 | `geo-topic-matcher.js` | P2 | [ ] | 按 `vehicle.series` 计数 |
| GEO-TOPIC-E02 | 自动生成 draft | `geo-page-generator.service.js` | P2 | [ ] | `bmw-3-brake-case` 类 |
| GEO-TOPIC-E03 | H5 路由 | 复用 `/topic/` | P2 | [ ] | 不新建 `/car/` 除非单独立项 |
| GEO-TOPIC-E04 | 与 DS-C-06 关系 | `docs/00_开发计划.md` | P2 | [ ] | 本阶段 = DS-C-06 轻量替代 |

---

## 10. 阶段 F · 发现层（P2 · 可选）

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-TOPIC-F01 | `llms.txt` | `backend/src/routes/public-h5.js` | P2 | [x] | `h5-discovery.service.js` + Nginx 反代 |
| GEO-TOPIC-F02 | 专题 RSS | `GET /feeds/topics.xml` | P2 | [x] | 最近发布专题 |
| GEO-TOPIC-F03 | IndexNow / 站长文档 | `docs/10_技术架构/` 运维备忘 | P2 | [ ] | 运营动作，非代码必达 |

---

## 11. 阶段 G · 信息增量注入（P0 · 2026-07-02）

> **任务真源**：[`09_GEO信息增量与RAG专线开发计划.md`](./09_GEO信息增量与RAG专线开发计划.md) 阶段 A；改造已发布服务/专题页的摘要与 FAQ 生成链路。

| ID | 任务 | 依赖 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-TOPIC-G01 | `buildAiSummary` 改用聚合统计 | IGAIN-A04 | P0 | [ ] | 替换通用模板 |
| GEO-TOPIC-G02 | 专题 FAQ ≥1 条案例衍生 | IGAIN-A06 | P0 | [ ] | 见 FAQ 规范 §19 |
| GEO-TOPIC-G03 | `topic_with_stats_rate` 指标 | IGAIN-A07 | P1 | [ ] | 健康度扩展 |

---

## 12. 指标与运维

| ID | 任务 | 说明 | 状态 |
| ---: | --- | --- | ---: |
| GEO-TOPIC-M01 | `prompt_intent_coverage` | 词库 prompt 有已发布专题映射的占比（主责；OBS 周报展示） | [x] |
| GEO-TOPIC-M02 | `topic_faq_completeness` | 已发布专题含 ≥3 条页内 FAQ 的占比 | [x] | `geo-topic-health.service.js` |
| GEO-TOPIC-M03 | `topic_with_case_rate` | 已发布且 index 专题中，≥1 脱敏案例的占比 | [x] | 同上 |
| GEO-TOPIC-M04 | 专题 CTA 埋点 | `h5_geo_topic_view` + consult/call 带 `utm_medium=geo` | [x] | 服务页 `channel: geo` |

**非主指标**：专题页 PV、人均阅读 FAQ 条数。

---

## 13. 信任与 EEAT（横切）

| ID | 任务 | 说明 | 状态 |
| ---: | --- | --- | ---: |
| GEO-TOPIC-T01 | 专题页展示 `updated_at`、案例数 | 信任信号 | [x] | 服务页 `h5-topic-trust` |
| GEO-TOPIC-T02 | `ai_summary` 顶栏 | 对齐 [`04_AI可引用摘要规范.md`](./04_AI可引用摘要规范.md) | [x] | `h5-topic-answer` |
| GEO-TOPIC-T03 | 免责声明 | 复用 `GEO_DISCLAIMER` | [x] | `renderDisclaimer` 双条 |
| GEO-TOPIC-T04 | 无案例 noindex | `seo.robots` | [x] | 仅 `caseCount > 0` 可 index |

---

## 14. 进度汇总

| 阶段 | 任务数 | [x] | [ ] | 备注 |
| --- | ---: | ---: | ---: | --- |
| A 入库 CRUD | 9 | 9 | 0 | |
| B 页内 FAQ | 8 | 8 | 0 | FAQ 落在 `/service/` 服务页 |
| C 案例矩阵 | 6 | 5 | 1 | C06 运营批量挂载为 P2 |
| D 首批 30 种子 | 6 | 6 | 0 | `geo:seed-topics` 已验收 |
| E 车型轻量 | 4 | 0 | 4 | P2 |
| G 信息增量 | 3 | 0 | 3 | P0 · 依赖 IGAIN-A |
| F 发现层 | 3 | 2 | 1 | F03 IndexNow 运维备忘 |
| T 信任横切 | 4 | 4 | 0 | 服务页答案页 |
| M 指标 | 4 | 4 | 0 | OBS 周报 + 健康度 |
| **合计** | **47** | **38** | **9** | **余 G、E、C06、F03** |

---

## 15. 三专项协同

```text
        GEO-TOPIC（答案层：专题 + FAQ）
              ↑ 挂载案例
        GEO-CITE（证据层：节点 → 成稿）
              ↑ 验证
        GEO-OBS（观测层：prompt 探测 / gap）
              └──────► 反哺 TOPIC 选题 & CITE 质量
```

| 顺序建议 | 说明 |
| --- | --- |
| 1 | [`06`](./06_GEO案例引用优化开发计划.md) A～B：案例成稿可用 ✅ |
| 2 | **GEO-TOPIC A～B～D**：30 条意图种子 + 服务页 GEO ✅ |
| 3 | **GEO-TOPIC C**：案例↔服务页内链矩阵 ✅（C06 批量挂载 P2 可选） |
| 4 | [`07`](./07_GEO引用观测开发计划.md) **A～C + 百炼 live** ✅ |
| 5 | **GEO-IGAIN A～B**（信息增量 + JSON Feed）— **← 当前建议 P0** |
| 6 | **GEO-TOPIC G** + **GEO-IGAIN E**（摘要注入 + 品牌词归因） | P1 |
| 7 | **GEO-IGAIN C～D**（实体图谱 + llms 2.0） | P1 |
| 8 | **GEO-TOPIC E**、**C06**、[`06`](./06_GEO案例引用优化开发计划.md) D vision 开生产 | P2 |

---

## 16. 修订记录

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-06-16 | V1.0 | 初稿：意图专题 + 页内 FAQ + 案例矩阵 |
| 2026-06-16 | V1.1 | 懒人用户/答案页形态；意图覆盖率与 citation 验收；M 指标 |
| 2026-06-18 | V1.3 | T/M 横切验收；F01 llms.txt + F02 RSS；A09 GeoPage §7.6 |
| 2026-06-19 | V1.4 | H5 搜索 geoPages 修复；与 OBS 百炼 live 联调验收 |
| 2026-07-02 | V1.5 | 新增阶段 G 信息增量；协同顺序调整；对接 `09_GEO信息增量与RAG专线` |
| 2026-06-16 | V1.2 | 服务页 = GEO 答案页；A～D + C(P1) 验收；30 条意图种子 `geo:seed-topics` |
