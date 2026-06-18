# GEO 引用观测开发计划

> **生效日期**：2026-06-16  
> **状态**：定稿 · **A～C 已验收**（2026-06-18）；下一项 **GEO-OBS D**（多引擎）或 **GEO-TOPIC E/F**
> **与主计划关系**：独立专项；进度在本文件勾选；完成后更新 [`docs/00_开发计划.md`](../00_开发计划.md) §2.6。  
> **对标能力**：国际 GEO SaaS（Profound / Peec AI）的 **citation tracking、used-vs-cited、prompt 探测**；**不做**对外通用 MarTech，仅服务辙见平台 **内部选题 + 商家价值话术 + 效果验证**。  
> **关联专项**：[`06_GEO案例引用优化开发计划.md`](./06_GEO案例引用优化开发计划.md)（提升可被引）· [`08_GEO意图专题开发计划.md`](./08_GEO意图专题开发计划.md)（承接 prompt 的流量页）

---

## 1. 文档信息

| 项目 | 内容 |
| --- | --- |
| 文档名称 | GEO 引用观测开发计划 |
| 当前版本 | V1.2 |
| 适用范围 | 运营后台、商家看板（只读指标）、定时任务、H5 爬虫日志扩展 |
| 不在范围 | 对外售卖 GEO SaaS、承诺「AI 引用次数」、全平台 10+ 引擎商用监测合同 |
| 任务 ID 前缀 | `GEO-OBS-*` |

### 1.1 进度标记

| 标记 | 含义 |
| --- | --- |
| `[ ]` | 待开发 |
| `[~]` | 进行中 |
| `[x]` | 已完成 |
| `[延]` | 延期 |
| `[-]` | 不做 |

---

## 2. 问题与目标

### 2.1 现状

| 已有 | 缺口 |
| --- | --- |
| `B-TRACK-04`：`h5_crawler_view`（GPTBot 等 UA 访问 H5） | 不知 AI **答案里**是否出现辙见 / 引用了哪条 URL |
| 商家看板 `crawlerViewCount` | 商家易误解为「被 AI 引用次数」 |
| 咨询线索、搜索词、GEO 专题 | 未系统化为 **prompt 词库** 驱动选题 |
| — | 无 **citation gap**（同城同服务竞品案例被引、本店没有） |

### 2.2 目标（一句话）

建立 **「爬虫来过 → 答案里有没有我们 → 该补什么内容 → 引后有没有咨询」** 的内部闭环；指标 **可验证、可行动**，不对 C 端承诺引用排名。

### 2.2.1 战略定位（2026-06-16）

辙见赌 **用户通过 AI 做选择、AI 压低营销权重**。本专项是 **成败裁判**：若长期 `prompt_probe_citation_rate` 接近 0 且 `post_citation_lead_rate` 无起色，应质疑 GEO 假设而非继续堆「人读型」内容。

### 2.3 与 Profound / Peec 的对照定位

| 它们 | 我们（GEO-OBS） |
| --- | --- |
| 卖监测 SaaS 给品牌 | **自有域名**监测 + **自有案例库**归因 |
| Prompt Volumes 独家数据 | **轻量 prompt 库**：线索词 + 搜索词 + 运营维护 |
| 全引擎订阅 | **P1**：豆包/DeepSeek/通义 + 国际 Bot 抽样；**可扩展** |
| Citation gap vs 竞品品牌 | Citation gap vs **同城同服务案例密度** |

### 2.4 产品红线

1. **不承诺**「AI 引用 N 次」；对外文案统一 **「爬虫访问（代理）」** vs **「答案探测（抽样）」**。
2. 探测任务 **合规**：遵守各平台 ToS；优先官方 API；UI 模拟仅内部、低频、限量。
3. 探测结果 **不入公开页**；仅运营台 + 商家看板聚合（可选）。
4. 与 [`06`](./06_GEO案例引用优化开发计划.md) 联动：观测到 gap → 触发 [`08`](./08_GEO意图专题开发计划.md) 补专题 / 催商家补案例。

### 2.5 北极星指标（三专项共用）

| 优先级 | 指标 ID | 定义 | 首目标（内部基线，可调） |
| ---: | --- | --- | --- |
| **P0** | `prompt_probe_citation_rate` | 词库探测中，答案含 `geo.simplewin.cn` 的占比 | 上线 OBS-B 后 **连续 4 周** 建立基线；MVP 后环比提升 |
| **P0** | `prompt_intent_coverage` | 词库中至少有 1 条已发布专题（或案例聚合页）可对应的 prompt 占比 | 首批 30 专题后 **≥40%** |
| **P1** | `prompt_probe_mention_rate` | 答案提及「辙见」或域名（无链接） | 与 citation 分开看 used-vs-cited |
| **P1** | `post_citation_lead_rate` | 探测周内有 citation 的 URL，7 日内 `h5_consult_click`+`h5_call_click` / 该 URL UV | 建立基线；优化 CTA 后环比 |
| **P2** | `crawler_view` | Bot 访问（已有） | 仅作必要非充分条件 |

**非主指标**：`h5_case_view`、页面停留、滚动深度（不用于 GEO 专项 Go/No-Go）。

**Go/No-Go 复盘节点**（建议）：OBS-B 运行满 **8 周** — 若 citation 率与引后咨询均无趋势，启动「GEO 假设复盘」会议，而非加功能。

---

## 3. 指标分层

| 层级 | 指标 ID | 含义 | 数据源 | 阶段 |
| --- | --- | --- | --- | --- |
| L0 | `crawler_view` | 已知 AI/搜索 Bot 访问 H5 URL 次数 | Nginx + `B-TRACK-04` ✅ | 已有 |
| L1 | `crawler_unique_url` | 被爬过的独立案例/专题 URL 数 | 爬虫日志解析 | A |
| L2 | `prompt_probe_mention` | 固定 prompt 答案中出现「辙见」或域名 | 合成 prompt 任务 | B |
| L3 | `prompt_probe_citation` | 答案含 `geo.simplewin.cn` 链接 | 同上 | B |
| L4 | `used_vs_cited` | 页面被提及但未带链接 vs 带链接 | L2/L3 差分 | C |
| L5 | `citation_gap_score` | 同城+同服务：专题/案例覆盖 vs 探测命中 | 业务 DB + L3 | C |
| L6 | `merchant_geo_opportunity` | 单店：同城同服务公开案例数排名 | 聚合 | C |
| L7 | `post_citation_lead` | 探测周内有 citation 的 URL 产生的咨询/电话 | 埋点 + probe join | B/C |

---

## 4. 阶段划分总览

| 阶段 | 名称 | 优先级 | 依赖 | 产出 |
| --- | --- | ---: | --- | --- |
| **A** | 爬虫日志深化 + 运营看板 | P1 | `B-TRACK-04` | URL 级热度、Bot 分布 | [x] |
| **B** | Prompt 词库 + 合成探测 | P1 | A | 周报：是否被提及/被引 | [x] |
| **C** | Citation gap + 商家机会分 | P2 | B、[`08`](./08_GEO意图专题开发计划.md) | 选题与招商数据 |
| **D** | 多引擎扩展 + 自动化报告 | P2 | B | 豆包/DeepSeek/元宝等 |

**推荐顺序**：`A → B`；`C` 待 [`08`](./08_GEO意图专题开发计划.md) 有 ≥10 个可索引专题后价值最大。

---

## 5. 阶段 A · 爬虫日志深化（P1）

> **验收**：运营台可见「近 7 天 Bot 访问 Top URL」；与商家看板 `crawlerViewCount` 口径文档一致。

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-OBS-A01 | URL 级聚合表 | `backend/prisma/schema.prisma`；migration | P1 | [x] | `crawler_url_daily` |
| GEO-OBS-A02 | ingest 扩展 | `crawler-track.service.js` | P1 | [x] | path → page_type（含 topic/city） |
| GEO-OBS-A03 | 日聚合任务 | `scripts/crawler-url-daily-aggregate.js` | P1 | [x] | 写入 `crawler_url_daily` |
| GEO-OBS-A04 | 运营 API | `admin.js`；`admin-crawler-stats.service.js` | P1 | [x] | `GET /admin/geo/crawler-stats` |
| GEO-OBS-A05 | 运营台页面 | `admin-web/.../geo/crawler-stats` | P1 | [x] | Bot 分布、Top URL、趋势 |
| GEO-OBS-A06 | 看板文案 | `packageMerchant/pages/dashboard` | P1 | [x] | 「搜索/AI爬虫」+ 免责 hint |
| GEO-OBS-A07 | robots 审计 | `h5-sitemap.service.js` | P2 | [ ] | 确认 GPTBot 等未被误拦 |
| GEO-OBS-A08 | 冒烟 | `scripts/crawler-stats-smoke.js` | P1 | [x] | ingest → aggregate → API |

### 5.1 阶段 A 验收

1. ECS 上 Bot 访问案例页后，运营台 24h 内可见该 URL。
2. 商家看板文案无「引用次数」误导。
3. **明确**：A 阶段 **不** 以 citation 率为验收项（尚无探测能力）。

### 5.2 阶段 A 与北极星

为 L1 `crawler_unique_url` 提供数据；**不等于** L3 citation。

---

## 6. 阶段 B · Prompt 词库 + 合成探测（P1）

> **验收**：每周自动跑 ≥20 条固定 prompt，产出 mention/citation 率周报。

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-OBS-B01 | Prompt 词库表 | `backend/prisma/schema.prisma` | P1 | [x] | `geo_prompt_probe` |
| GEO-OBS-B02 | 词库种子 | `geo-prompt-seed.js` + `geo-prompt-seed-sync.js` | P1 | [x] | 30 条与 TOPIC-D 对齐 |
| GEO-OBS-B03 | 词库运营 API | `admin.js`；`admin-geo-prompt.service.js` | P1 | [x] | CRUD |
| GEO-OBS-B04 | 探测执行器 | `geo-prompt-probe.service.js` | P1 | [x] | API / dry-run |
| GEO-OBS-B05 | 结果表 | migration | P1 | [x] | `geo_prompt_probe_result` |
| GEO-OBS-B06 | 定时任务 | `geo-prompt-probe-cron.sh` | P1 | [x] | `npm run geo:probe` |
| GEO-OBS-B07 | 周报 API | `GET /admin/geo/probe-report` | P1 | [x] | citation / coverage |
| GEO-OBS-B08 | 运营台 UI | `admin-web/.../geo/probe-report` | P1 | [x] | 北极星周报 |
| GEO-OBS-B09 | 配置 | `config/index.js` | P1 | [x] | `GEO_PROBE_*` 环境变量 |
| GEO-OBS-B10 | 合规说明 | 本文 §9 | P1 | [x] | 内部使用、不对外承诺 |

### 6.1 初始 Prompt 模板（种子）

```
{城市}{车型}{故障现象}一般怎么检查？
{城市}{服务项目}大概多少钱？
{服务项目}维修过程通常包括哪些步骤？
{车型}{服务项目}常见案例参考
```

变量由词库行填充；**禁止**含用户隐私。

### 6.2 阶段 B 验收

1. 手动触发探测，结果写入 DB 且运营台可查看。
2. 能区分 `mentioned`（提及辙见）与 `cited_url`（含链接）。
3. **周报必含**：`prompt_probe_citation_rate`、`prompt_intent_coverage`（对接 [`08`](./08_GEO意图专题开发计划.md) 专题表）。
4. 词库 ≥20 条且与杭州首发服务/故障种子对齐。

---

## 7. 阶段 C · Citation gap + 商家机会（P2）

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-OBS-C01 | Gap 算法 | `backend/src/utils/geo-citation-gap.js` | P2 | [x] | 城市+服务：公开案例数、探测命中、专题有无 |
| GEO-OBS-C02 | 运营 gap API | `GET /admin/geo/citation-gaps` | P2 | [x] | 优先补案例/专题列表 |
| GEO-OBS-C03 | 商家机会 API | `GET /merchant/geo/opportunity` | P2 | [x] | 本店 vs 同城同服务中位数 |
| GEO-OBS-C04 | 工作台卡片 | `packageMerchant/pages/workbench/index.wxml` | P2 | [x] | 「同城同服务已有 N 条公开案例」 |
| GEO-OBS-C05 | 联动专题 | 对接 [`08`](./08_GEO意图专题开发计划.md) `GEO-TOPIC-*` | P2 | [x] | gap 高且专题缺失 → 运营待办 |
| GEO-OBS-C06 | Used vs cited | `geo-prompt-probe.service.js` | P2 | [x] | 域名出现无链接 vs 带链接 |
| GEO-OBS-C07 | 引后转化 join | `geo-prompt-probe.service.js` + 埋点日表 | P2 | [x] | `post_citation_lead`；CTA 须 `utm_medium=geo` |

### 7.1 阶段 C 验收

1. 运营台列出 Top 10「有流量意图但无专题/案例不足」组合。
2. 商家工作台展示机会分（不展示竞品名）。
3. 可输出 **引后转化** 简表：`post_citation_lead` 按专题/案例 URL 聚合（允许样本少时仅内部看）。

---

## 8. 阶段 D · 多引擎扩展（P2）

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-OBS-D01 | 引擎适配器 | `backend/src/services/geo-probe-engines/*`（新建） | P2 | [ ] | deepseek、doubao、tongyi、perplexity（按需） |
| GEO-OBS-D02 | 探测编排 | `geo-prompt-probe.service.js` | P2 | [ ] | 每 prompt 每引擎限频 |
| GEO-OBS-D03 | 对比报表 | 运营台 probe-report | P2 | [ ] | 引擎维度 mention/citation 率 |
| GEO-OBS-D04 | 邮件/企微周报 | 可选 cron 通知 | P2 | [ ] | 模板见 **§11** |

---

## 9. 合规与口径（对外）

**商家看板 / 帮助文案标准表述**：

> 「搜索/AI 爬虫访问」指已知搜索引擎或 AI 爬虫访问本店公开页的次数，**不代表** AI 在对话中引用本店或引用次数。  
> 「答案探测」为平台内部抽样监测，仅供参考，**不构成**排名或引用承诺。

**禁止**：全网最低、保证被 AI 推荐、引用次数对赌。

---

## 10. 相对大平台的引用策略（七条杠杆）

> **定位**：不与点评/地图/抖音在「找店型」prompt 上正面争夺默认引用；主攻 **知识型 B**（怎么回事）与 **证据型 C**（类似案例过程）。详见对话纪要 2026-06-16。

| # | 杠杆 | 辙见动作 | 主要计划 |
| ---: | --- | --- | --- |
| 1 | **独占信息类型** | 节点事实 → 可摘引 `ai_summary`；避免营销句 | [`06`](./06_GEO案例引用优化开发计划.md) |
| 2 | **专题优先于长案例** | 一 prompt 一专题页 + 页内 FAQ | [`08`](./08_GEO意图专题开发计划.md) |
| 3 | **机器可读** | Bot 预渲染、Schema、首屏含摘要 | CITE-E、TOPIC-B |
| 4 | **信任链 EEAT** | 授权/脱敏/审核标签 + 诚实免责 | TOPIC-T、设计体系 |
| 5 | **意图簇密度** | 同城×服务多条案例挂同一专题 | TOPIC-C、D |
| 6 | **语料生态** | 公众号链回 H5、RSS/Feed、合规换链 | TOPIC-F |
| 7 | **观测驱动** | 周报看 citation / gap，不盲堆 PV | 本节 §11 |

**三类 prompt 分工**（运营判定时使用）：

| 类型 | 示例 | 策略 |
| --- | --- | --- |
| **A 找店** | 「杭州修车哪家好」 | **不主攻**；专题底栏 CTA 即可 |
| **B 知识** | 「刹车异响要先查什么」 | **专题 + FAQ** 主战场 |
| **C 证据** | 「宝马3系换刹车片过程参考」 | **脱敏案例** 主战场 |

---

## 11. 运营周报模板（每周 Checklist）

> **频率**：每周一（覆盖上周一至周日探测与埋点）。**产出**：运营台 `probe-report` 导出 + 可选企微/邮件（`GEO-OBS-D04`）。  
> **读者**：运营 + 内容负责人；**不**对外发给商家作「引用承诺」。

### 11.1 北极星一页纸

| 指标 | 本周 | 上周 | 环比 | 备注 |
| --- | ---: | ---: | ---: | --- |
| `prompt_probe_citation_rate` | | | | 主指标 |
| `prompt_intent_coverage` | | | | 词库总数： |
| `prompt_probe_mention_rate` | | | | used vs cited |
| `post_citation_lead_rate` | | | | 样本小则标「仅供参考」 |
| `citable_summary_rate`（新发布案例） | | | | 来自 CITE |
| `crawler_view` | | | | 必要非充分 |

**本周一句话结论**（必填）：  
> 例：「citation 率持平，3 条 B 类 prompt 仍只引点评；已立项补 `hangzhou-brake-noise` 专题。」

### 11.2 每周固定动作（Checklist）

**探测与词库**

- [ ] 词库探测已跑满（≥20 条 active prompt，周频）
- [ ] 新入库咨询/搜索词 **脱敏** 后审查，合格则加入词库并标 A/B/C 类型
- [ ] 每条 **新发布专题** 绑定 ≥1 条 prompt（更新 coverage）

**Citation 复盘（从探测结果导出 Top 5）**

| prompt | 类型 A/B/C | mention | citation | 引用的域名（若非辙见） | 本周动作 |
| --- | --- | ---: | ---: | --- | --- |
| | | | | | |

动作编码：

| 代码 | 含义 | 派单 |
| --- | --- | --- |
| **T+** | 新建/发布专题 | [`08`](./08_GEO意图专题开发计划.md) |
| **C+** | 催商家补案例 / 审核积压 | CITE + 商家运营 |
| **R** | 改摘要/FAQ/首屏（不编造） | CITE-B / TOPIC-B |
| **E** | 预渲染/Schema 排查 | CITE-E |
| **—** | A 类找店词，不投入 | 记录即可 |

**Gap 与供给**

- [ ] 查看 `citation-gaps` Top 10（城市+服务意图无专题或案例 <N）
- [ ] 同城同服务 **公开案例数** 中位数 vs 零案例门店数（商家机会话术素材）

**引后转化（样本允许时）**

- [ ] 本周有 citation 的 URL 列表 → 7 日内 `h5_consult_click` + `h5_call_click`
- [ ] CTA 带 `utm_medium=geo` 的链接是否全覆盖（案例+专题底栏）

**假设复盘（每 8 周或 citation 连续 4 周为 0 时触发）**

- [ ] 是否召开 GEO 假设复盘：继续 / 收缩词库 / 调整专题策略
- [ ] 记录决议与下周实验（如：加 10 条 B 类故障问答专题）

### 11.3 与大平台对比时的口径（对内）

| 说法 | 对错 |
| --- | --- |
| 「我们要让 AI 不引点评」 | ✗ 不现实 |
| 「我们在 **维修事实/过程** 类 prompt 上占引用位」 | ✓ |
| 「爬虫多 = 被 AI 引用了」 | ✗ |
| 「点评是星评；辙见是过程事实，两种搜索」 | ✓ 商家话术 |

### 11.4 商家侧可选摘要（周报衍生，非每周必发）

> 本周平台内部监测：您所在城市「{服务}」相关 AI 问答中，公开 **脱敏案例** 仍较少的门店较多。完善服务相册并授权公开，有助于在「{故障/服务} 怎么处理」类问题中成为可引用参考。**这不代表**地图或点评排名变化。

---

## 12. 进度汇总

| 阶段 | 任务数 | [x] | [ ] | 备注 |
| --- | ---: | ---: | ---: | --- |
| A 爬虫深化 | 8 | 7 | 1 | A07 robots 审计 P2 |
| B Prompt 探测 | 10 | 10 | 0 | dry-run 默认；live 需 `GEO_PROBE_ENABLED` |
| C Citation gap | 7 | 7 | 0 | P2 |
| D 多引擎 | 4 | 0 | 4 | P2 |
| **合计** | **29** | **24** | **5** |

---

## 13. 专项协同

```text
GEO-CITE（成稿质量）──┐
GEO-TOPIC（意图页）───┼──► GEO-OBS（验证是否被引）──► 运营选题 / 商家催补
B-TRACK-04（爬虫）───┘
```

| 触发 | 动作 |
| --- | --- |
| `crawler_view` 高、probe citation 低 | 查 [`06`](./06_GEO案例引用优化开发计划.md) 成稿质量 / 预渲染 |
| probe 某 prompt 常引竞品域 | [`08`](./08_GEO意图专题开发计划.md) 补专题 |
| 同城案例数 gap 大 | 商家工作台机会卡片 + 销售话术 |

---

## 14. 修订记录

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-06-16 | V1.0 | 初稿：对标 Profound/Peec 观测层，内部闭环 |
| 2026-06-16 | V1.1 | 北极星指标、引后转化、Go/No-Go；弱化爬虫作唯一成功标准 |
| 2026-06-16 | V1.2 | §10 七条引用杠杆；§11 运营周报 Checklist |
| 2026-06-16 | V1.3 | A～B 验收：crawler_url_daily、probe 词库/周报、运营台 |
| 2026-06-18 | V1.4 | C 验收：citation-gaps、used-vs-cited、引后转化、商家机会卡片 |
