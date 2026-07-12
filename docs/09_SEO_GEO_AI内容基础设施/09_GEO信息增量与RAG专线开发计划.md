# GEO 信息增量与 RAG 专线开发计划

> **生效日期**：2026-07-02  
> **状态**：定稿 · **待开发**（承接 GEO 三件套收口后的 **第四专项**）  
> **与主计划关系**：独立专项；进度在本文件勾选；完成后更新 [`docs/00_开发计划.md`](../00_开发计划.md) §2.6。  
> **战略依据**：外部 GEO 行业共识（2025–2026）——AI 不会取代 SEO，但会淘汰 **无信息增量** 的泛科普内容；胜者为 **专有数据 + 实体图谱 + RAG 友好专线**。  
> **关联专项**：[`06_GEO案例引用优化开发计划.md`](./06_GEO案例引用优化开发计划.md)（证据供给）· [`08_GEO意图专题开发计划.md`](./08_GEO意图专题开发计划.md)（答案页）· [`07_GEO引用观测开发计划.md`](./07_GEO引用观测开发计划.md)（验证闭环）

---

## 1. 文档信息

| 项目 | 内容 |
| --- | --- |
| 文档名称 | GEO 信息增量与 RAG 专线开发计划 |
| 当前版本 | V1.0 |
| 适用范围 | 服务页/专题页摘要与 FAQ、公开 JSON Feed、`llms.txt`、Schema 实体图谱、运营台质量评分 |
| 不在范围 | 伪原创批量生成、对外售卖 GEO SaaS、全站 SSG（`DS-C-13/14` 仍 `[延]`）、PBN/外链灰产 |
| 任务 ID 前缀 | `GEO-IGAIN-*` |

### 1.1 进度标记

同 [`07_GEO引用观测开发计划.md`](./07_GEO引用观测开发计划.md) §1.1。

---

## 2. 问题与目标

### 2.1 现状（2026-07-02 复盘）

| 已有（GEO 三件套） | 缺口（对照行业 GEO 高阶玩法） |
| --- | --- |
| 真实案例六阶段证据链、Bot 预渲染、JSON-LD | 服务/专题 `ai_summary` 与 FAQ **多为合规通用模板**，AI 可自行生成同等内容 |
| `llms.txt` + 专题 RSS + sitemap | `llms.txt` 仅索引 20 服务 + 10 案例；**无纯净 JSON 专线** |
| `caseCount`、citation gap 等后台指标 | **未写入可见摘要/Schema**，不构成「信息增量」 |
| `prompt_probe_citation_rate` 北极星 | 缺 **品牌词搜索 uplift**、Direct 隐形归因闭环 |
| Schema 单页类型覆盖 | 缺 **实体 @id 互链**、`Dataset` 聚合统计封装 |
| `GEO-TOPIC-E` 车型轻量专题 `[ ]` | 长尾「车型+故障」仍弱；FAQ 未强制案例衍生 |

### 2.2 目标（一句话）

把 **数万次真实维修履约数据** 转化为 AI **无法凭空编造、只能引用** 的结构化事实——通过 **聚合统计注入摘要/FAQ**、**公开 JSON Feed 专线**、**实体图谱 Schema**，建立辙见在生成式引擎中的 **数据护城河**。

### 2.3 核心原则：信息增量（Information Gain）

动笔或自动生成任何 GEO 文案前，必须通过以下自检：

| 检查项 | 通过标准 | 不通过处理 |
| --- | --- | --- |
| AI 可答性 | 用千问/豆包对同 prompt 提问，辙见页面是否提供 **AI 答不出的数字或分布** | 不得 index；运营台标黄 |
| 样本标注 | 含统计句时必须带 **N=样本量** 与 **统计窗口**（如近 12 个月） | 不得发布无样本量的百分比 |
| 来源可追溯 | 统计来自 `public_cases` 聚合，可下钻到脱敏案例列表 | 禁止手工编造分布 |
| 合规 | 不承诺效果、不虚构评价、不含隐私 | block |

**禁止**再批量产出仅含「常见咨询汇总、需到店检测」而无案例数据的专题摘要（见 `geo-page-generator.service.js` 旧模板）。

### 2.4 与三件套协同

```text
GEO-CITE（节点证据）
      ↓ 供给 raw facts
GEO-IGAIN（聚合 → 信息增量摘要 + JSON Feed + 实体图谱）  ← 本专项
      ↓ 可被引内容
GEO-TOPIC（答案页形态） + GEO-OBS（探测 + 品牌词归因）
```

---

## 3. 阶段 A · 案例聚合统计与摘要注入（P0）

> **验收**：已发布服务页 `ai_summary` 中 **≥50%** 含至少 1 条带 N= 的统计句；运营台可见 `information_gain_score`。

### 3.1 聚合维度

| 维度 | 统计项 | 用途 |
| --- | --- | --- |
| 城市 + 服务 | 案例数、方案价中位数/区间、常见主因 Top3（从检查结论聚类） | 城市服务专题摘要 |
| 服务（全国） | 案例数、里程中位数、配件出现频次 | 标准服务页摘要 |
| 城市 + 故障标签 | 案例数、关联服务分布 | 故障问答专题 |
| 车系 + 服务 | 案例数（≥N 才生成） | `GEO-TOPIC-E` 联动 |

**样本门槛**：N < 3 不写百分比，仅写「本库现有 N 例脱敏案例」；N < 1 不 index。

### 3.2 任务表

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-IGAIN-A01 | 聚合服务 `geo-case-aggregate.service.js` | `backend/src/services/` | P0 | [x] | 读 `public_cases`；脱敏聚合 |
| GEO-IGAIN-A02 | 主因/故障标签聚类（规则版） | `geo-case-aggregate.service.js` | P0 | [x] | 从 `inspectResult` 关键词；不调 LLM |
| GEO-IGAIN-A03 | 注入服务页 API | `h5-service-item.service.js` | P0 | [x] | 返回 `aggregateStats` + 增强 `aiSummary` |
| GEO-IGAIN-A04 | 注入专题/geo_pages 生成器 | `geo-page-generator.service.js` | P0 | [x] | 种子 draft + 运行时 `h5-geo-topic` 全类型注入 |
| GEO-IGAIN-A05 | H5 首屏展示统计条 | `service-render.js`；`topic-render.js` | P0 | [x] | `service-item-render` `renderTrustMeta` |
| GEO-IGAIN-A06 | 案例衍生 FAQ（≥1 条） | `geo-case-aggregate.service.js` | P0 | [x] | `buildDerivedAggregateFaq` |
| GEO-IGAIN-A07 | 运营台信息增量评分 | `admin-web` CaseGeoEditor / geo-pages edit | P1 | [ ] | 黄/绿标；无增量 warn |
| GEO-IGAIN-A08 | 冒烟 | `backend/scripts/geo-aggregate-smoke.js` | P0 | [x] | 聚合 → API → Feed |

### 3.3 摘要句式模板（规范真源见 [`04_AI可引用摘要规范.md`](./04_AI可引用摘要规范.md) §15）

```
【城市】【服务】：辙见平台近 12 个月收录 {N} 例脱敏案例；方案价参考区间 ¥{low}–¥{high}（中位数 ¥{median}，仅供参考）。
常见检查结论包括：{cause1}（{n1} 例）、{cause2}（{n2} 例）。具体方案与费用以到店检测为准。
```

---

## 4. 阶段 B · 公开 JSON Feed 专线（P0）

> **验收**：`GET /public/v1/cases/{slug}.json` 返回 200 + 纯净字段；`llms.txt` 声明 Feed URL；`h5-chain-smoke` 扩展通过。

### 4.1 设计原则（RAG 友好）

1. **无 HTML/CSS/追踪脚本**；`Content-Type: application/json`。
2. 字段与页面可见内容、JSON-LD **一致**（禁止 Feed 多写）。
3. 仅 `published_h5` + `seo_noindex=0` 资源可访问；其余 404。
4. 支持 `ETag` / `Last-Modified`；Bot 与 API 客户端共用。
5. **不替代** Bot 预渲染；与之并行，降低 JS 解析依赖。

### 4.2 端点规划

| 端点 | 说明 |
| --- | --- |
| `GET /public/v1/cases/{slug}.json` | 案例事实：摘要、geo 字段、节点摘要、FAQ、aggregateStats |
| `GET /public/v1/services/{slug}.json` | 服务说明 + FAQ + 聚合统计 + 相关案例 id 列表 |
| `GET /public/v1/geo-pages/{slug}.json` | 意图专题（合并服务层） |
| `GET /public/v1/index.json` | 站点索引：服务列表、最新案例、专题、Feed 说明 |

### 4.3 任务表

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-IGAIN-B01 | 路由与鉴权（公开只读） | `backend/src/routes/public-h5.js` | P0 | [x] | `/api/v1/public/v1/*` |
| GEO-IGAIN-B02 | 案例 Feed DTO | `public-feed.service.js` | P0 | [x] | 隐私字段过滤 |
| GEO-IGAIN-B03 | 服务/专题 Feed DTO | 复用 A03 聚合 | P0 | [x] | |
| GEO-IGAIN-B04 | 站点索引 Feed | `public-feed.service.js` | P1 | [x] | |
| GEO-IGAIN-B05 | Nginx 反代 + 缓存头 | `simplewin.conf` | P0 | [x] | `/public/v1/` → API |
| GEO-IGAIN-B06 | 冒烟 | `h5-chain-smoke.js` 扩展 | P0 | [x] | |

---

## 5. 阶段 C · 实体图谱与 Dataset Schema（P1）

> **验收**：案例/服务/门店页 View Source 含 `@graph` 互链 `@id`；服务页含 `Dataset` 描述聚合统计。

### 5.1 实体 ID 规范

| 实体 | @id 格式 | 示例 |
| --- | --- | --- |
| 平台 | `{base}/#organization` | 辙见 Organization |
| 门店 | `{base}/store/{id}#autorepair` | AutoRepair |
| 服务 | `{base}/service/{slug}#service` | Service |
| 案例 | `{base}/case/{slug}#article` | Article |
| 数据集 | `{base}/service/{slug}#dataset` | Dataset（聚合统计） |

### 5.2 任务表

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-IGAIN-C01 | `@graph` 生成器 | `backend/src/lib/schema-graph.js` | P1 | [x] | 统一 `@id` |
| GEO-IGAIN-C02 | 案例页 graph | `case-render.js`；Bot prerender | P1 | [x] | 优先 `data.schemaGraph` |
| GEO-IGAIN-C03 | 服务页 Dataset Schema | `service-item-render.js` | P1 | [x] | 聚合统计入 `variableMeasured` |
| GEO-IGAIN-C04 | 首页 Organization.sameAs | `home-render.js` | P2 | [x] | `GEO_ORG_SAME_AS` |
| GEO-IGAIN-C05 | Schema 校验冒烟 | `case-bot-prerender-smoke.js` | P1 | [x] | `bot-schema-assert` 解析 @graph |

规范真源：[`03_结构化数据 Schema 规范.md`](./03_结构化数据 Schema 规范.md) §15–§16。

---

## 6. 阶段 D · 发现层 2.0（P1）

> **验收**：`llms.txt` 含 JSON Feed 入口说明；案例/专题索引扩展至 sitemap 同源全量（分页摘要）。

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-IGAIN-D01 | `llms.txt` 2.0 | `h5-discovery.service.js` | P1 | [x] | 增加 Feed 段、聚合说明 |
| GEO-IGAIN-D02 | `llms-full.txt` 或分页 | 同上 | P2 | [ ] | 全量案例 slug 列表（可选） |
| GEO-IGAIN-D03 | robots 声明 Feed | `h5-sitemap.service.js` | P1 | [ ] | 注释或 `LLMs-Feed` 行 |
| GEO-IGAIN-D04 | GEO-OBS-A07 联动 | robots 审计 GPTBot | P1 | [ ] | 与 OBS 共用验收 |

---

## 7. 阶段 E · 品牌词与隐形归因（P1 · 与 GEO-OBS 协同）

> **验收**：运营周报并列展示 `prompt_probe_citation_rate` 与 `brand_search_uplift`；商家看板拆分「爬虫访问」vs「探测提及」。

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-IGAIN-E01 | 品牌词事件定义 | `h5/shared/track.js` | P1 | [x] | `h5_search_submit` 含「辙见」→ `brand_search` |
| GEO-IGAIN-E02 | 日聚合 `brand_search_daily` | migration + aggregate 脚本 | P1 | [x] | cron 日 job |
| GEO-IGAIN-E03 | 与 probe 周关联分析 | `geo-prompt-probe.service.js` | P1 | [x] | 周报并入 `brand_search_uplift` |
| GEO-IGAIN-E04 | 运营台周报 UI | `admin-web/.../probe-report` | P1 | [x] | |
| GEO-IGAIN-E05 | 商家看板文案拆分 | `packageMerchant/pages/dashboard` | P1 | [x] | 爬虫 ≠ 引用 |

指标定义真源：[`07_GEO引用观测开发计划.md`](./07_GEO引用观测开发计划.md) §2.5（增补）。

---

## 8. 阶段 F · 车型轻量专题联动（P2）

> 与 [`08_GEO意图专题开发计划.md`](./08_GEO意图专题开发计划.md) 阶段 E 合并执行；**本专项要求 E 阶段摘要必须含车系聚合统计**。

| ID | 任务 | 说明 | 优先级 | 状态 |
| ---: | --- | --- | ---: | ---: |
| GEO-IGAIN-F01 | E01–E04 摘要含聚合 | 依赖 A01；`vehicle.series` 计数 | P2 | [x] | `geo-vehicle-topic.service.js` |
| GEO-IGAIN-F02 | 车系 FAQ 衍生 | 至少 1 条案例统计型 FAQ | P2 | [x] | 专题页 runtime 注入 |

---

## 9. 北极星指标（本专项增补）

| 优先级 | 指标 ID | 定义 | 首目标 |
| ---: | --- | --- | --- |
| **P0** | `information_gain_rate` | 已 index 服务/专题页中，`ai_summary` 含 ≥1 条带 N= 统计句的占比 | 上线 A 后 **≥50%** |
| **P0** | `public_feed_availability` | 已 index 案例/服务页有对应 JSON Feed 200 的占比 | **100%** |
| **P1** | `brand_search_uplift` | 探测有 citation 的周，brand/direct 会话数相对前 4 周中位数 | 建立基线后环比 |
| **P1** | `schema_graph_coverage` | 案例/服务页含 `@graph` 互链的占比 | **≥80%** |
| **P2** | `faq_case_derived_rate` | 服务/专题 FAQ 中 ≥1 条来自案例聚合的占比 | **≥30%** |

**非主指标**：页面 PV、停留时长、爬虫访问量（仅作辅助）。

---

## 10. 阶段 G · 聚合全覆盖与运营评分（P0 · 2026-07-13）

> **背景**：IGAIN A～F 核心能力已上线，但部分已发布页仍缺 N= 统计句、运营台无信息增量评分。本阶段收口 **覆盖率** 与 **质量闸门**。

### 10.1 目标

1. 已 index 服务/专题页 `information_gain_rate` ≥ **80%**（从 50% 提升）；
2. 运营台对无 N= 统计的已发布页 **黄标 warn**；
3. 存量 `geo_pages` 批量注入聚合统计。

### 10.2 任务表

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-IGAIN-G01 | 运营台信息增量评分 | `admin-web` CaseGeoEditor / geo-pages | P0 | [x] | 黄/绿标；无 N= warn |
| GEO-IGAIN-G02 | 存量服务页批量 refresh | `scripts/geo-aggregate-backfill.js` | P0 | [x] | 已发布全量 |
| GEO-IGAIN-G03 | `information_gain_rate` 周报 | `geo-topic-health.service.js` | P1 | [ ] | 对接 OBS 周报 |
| GEO-IGAIN-G04 | 无案例页强制 noindex 审计 | `h5-service-item.service.js` | P1 | [ ] | caseCount=0 |
| GEO-IGAIN-G05 | 动态 `updated_at` 策略 | 聚合重算钩子 | P1 | [~] | computedAt 已写入 |
| GEO-IGAIN-G06 | 冒烟 | `geo-aggregate-smoke.js` 扩展 | P0 | [x] | 覆盖率断言 |

### 10.3 验收

1. 运营台编辑页可见信息增量评分；
2. 已 index 页 ≥80% 含 N= 统计句；
3. 统计变更后页面 `updated_at` 与 Feed `Last-Modified` 同步更新。

---

## 11. 阶段 H · JSON Feed 与发现层全量对接（P1 · 2026-07-13）

> **背景**：Feed 与 llms.txt 2.0 核心已上线，余 **全量索引、robots 声明、trustMeta/高阶聚合字段** 对接。

### 11.1 目标

1. 已 index 案例/服务/专题 **100%** 有对应 Feed 200；
2. `llms.txt` 声明全量入口与字段说明；
3. Feed 字段与 H5/Schema **三处一致**（含 trustMeta、advanced 聚合）。

### 11.2 任务表

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-IGAIN-H01 | `llms-full.txt` 分页索引 | `h5-discovery.service.js` | P1 | [x] | 全量 slug 列表 |
| GEO-IGAIN-H02 | robots Feed 声明 | `h5-sitemap.service.js` | P1 | [x] | LLMs-Feed |
| GEO-IGAIN-H03 | Feed 接入 trustMeta | `public-feed.service.js` | P0 | [x] | 依赖 GEO-TRUST-06 |
| GEO-IGAIN-H04 | Feed 接入 advanced 聚合 | `public-feed.service.js` | P1 | [x] | 依赖 GEO-AGG-09 |
| GEO-IGAIN-H05 | `index.json` 扩展 | `public-feed.service.js` | P1 | [x] | 专题+统计说明 |
| GEO-IGAIN-H06 | Feed 一致性审计脚本 | `public-feed-parity-smoke.js` | P0 | [x] | H5=Feed=Schema |
| GEO-IGAIN-H07 | ETag 缓存验证 | `public-h5.js` | P2 | [ ] | 聚合更新后失效 |
| GEO-IGAIN-H08 | GPTBot robots 审计 | 协同 OBS-D04 | P1 | [ ] | |

### 11.3 验收

1. `public_feed_availability` = **100%**；
2. `h5-chain-smoke` 含 Feed parity 断言；
3. `llms.txt` 含 Feed URL、字段契约、统计窗口说明。

---

## 12. 进度汇总

| 阶段 | 任务数 | [x] | [ ] | 备注 |
| --- | ---: | ---: | ---: | --- |
| A 聚合与摘要注入 | 8 | 8 | 0 | ✅ |
| B JSON Feed 专线 | 6 | 6 | 0 | ✅ |
| C 实体图谱 Schema | 5 | 5 | 0 | ✅ |
| D 发现层 2.0 | 4 | 3 | 1 | D02 llms-full 待做 |
| E 品牌词归因 | 5 | 5 | 0 | ✅ |
| F 车型联动 | 2 | 2 | 0 | ✅ |
| **G 聚合全覆盖** | 6 | 4 | 2 | G03/G04 待 OBS |
| **H Feed 全量对接** | 8 | 6 | 2 | H07/H08 待做 |
| **合计** | **44** | **39** | **5** | |

---

## 13. 推荐执行顺序

| 顺序 | 内容 | 优先级 | 状态 |
| ---: | --- | ---: | ---: |
| 1 | **GEO-IGAIN A**（聚合统计 → 摘要/FAQ 注入） | P0 | ✅ |
| 2 | **GEO-IGAIN B**（JSON Feed 专线） | P0 | ✅ |
| 3 | **GEO-IGAIN E**（品牌词归因，与 OBS 周报合并） | P1 | ✅ |
| 4 | **GEO-IGAIN C**（实体 @graph + Dataset） | P1 | ✅ |
| 5 | **GEO-IGAIN D**（llms.txt 2.0） | P1 | ✅ |
| 6 | **GEO-IGAIN F** + **GEO-TOPIC E**（车型轻量） | P2 | ✅ |
| 7 | **GEO-TRUST**（案例信任元数据） | P0 | 待开发 |
| 8 | **GEO-IGAIN G**（聚合全覆盖 + 运营评分） | P0 | 待开发 |
| 9 | **GEO-AGG**（高阶二维聚合） | P0/P1 | 待开发 |
| 10 | **GEO-IGAIN H**（Feed 全量对接 + parity） | P1 | 待开发 |
| 11 | **GEO-TOPIC H**（50～100 意图专题扩容） | P1 | 待开发 |
| 12 | **GEO-CITE D** vision 开生产（图说/alt 信息增量） | P2 | [~] |

---

## 14. 修订记录

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-02 | V1.0 | 初稿：信息增量、JSON Feed、实体图谱、品牌词归因；承接 GEO 三件套 Phase 2 |
| 2026-07-13 | V1.1 | 新增阶段 G（聚合全覆盖）、H（Feed 全量对接）；进度汇总与执行顺序更新 |
