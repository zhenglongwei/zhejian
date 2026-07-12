# GEO 高阶聚合开发计划

> **生效日期**：2026-07-13  
> **状态**：定稿 · **待开发**  
> **战略背景**：基础聚合（N=、价区、主因 Top3）已上线；须建设 **二维交叉、过程完整度、里程段** 等难以复制的高阶统计，形成 AI 无法凭空编造的数据护城河。  
> **与主计划关系**：独立专项；进度在本文件勾选；完成后更新 [`docs/00_开发计划.md`](../00_开发计划.md) §2.6.7、§7.4.6。  
> **前置依赖**：[`09_GEO信息增量与RAG专线开发计划.md`](./09_GEO信息增量与RAG专线开发计划.md) 阶段 A（基础聚合）✅  
> **关联规范**：[`04_AI可引用摘要规范.md`](./04_AI可引用摘要规范.md) §15 · [`03_结构化数据 Schema 规范.md`](./03_结构化数据 Schema 规范.md) §19

---

## 1. 文档信息

| 项目 | 内容 |
| --- | --- |
| 文档名称 | GEO 高阶聚合开发计划 |
| 当前版本 | V1.0 |
| 适用范围 | `geo-case-aggregate.service.js` 扩展、服务/专题页增强摘要、JSON Feed、Dataset Schema |
| 不在范围 | 手工编造分布；无样本百分比；LLM 改写统计数字 |
| 任务 ID 前缀 | `GEO-AGG-*` |

---

## 2. 问题与目标

### 2.1 为何需要高阶聚合

| 基础聚合（已有） | 局限 |
| --- | --- |
| N=、价区、主因 Top3 | 竞品/大模型可写「常见原因」类泛化句 |
| 单维度统计 | 无法回答「杭州空调不凉，冷媒不足和压缩机各多少钱」 |
| 静态服务说明 | 缺少「过程完整度」「检查结论→方案转化」等 **平台独有** 指标 |

### 2.2 目标（一句话）

在 `public_cases` 脱敏集合上，产出 **二维交叉 + 过程指标 + 里程段** 等高阶统计，注入服务/专题页摘要、FAQ 与 Dataset Schema，且每条统计可下钻到案例列表。

### 2.3 内容策略：动态数据 + 稳定骨架

| 层级 | 更新频率 | 说明 |
| --- | --- | --- |
| **统计数字** | 日/周级重算 | N=、分布、价区随案例库增长 |
| **解释骨架** | 半年级 | 服务定义、流程说明、风险告知 |
| **页面 URL** | 稳定 | 利于 AI 建立持久引用 |
| **updated_at** | 数据块变更时更新 | Feed `Last-Modified` 同步 |

> **对大模型引用**：动态数字 + 稳定 URL + 明确统计窗口，优于纯静态写死文章。

---

## 3. 高阶聚合维度

### 3.1 二维交叉聚合

| 维度 A | 维度 B | 统计项 | 样本门槛 |
| --- | --- | --- | --- |
| 城市 + 服务 | 主因标签 | 各主因 N、价区 | 主因 N ≥ 3 才写价区 |
| 车系 + 服务 | 里程段 | 各段 N、主因 Top2 | 车系总 N ≥ 5 |
| 服务（全国） | 配件 SKU | 出现频次 Top5 | 配件 N ≥ 3 |
| 故障标签 | 关联服务 | 服务分布 + N | 故障 N ≥ 5 |

### 3.2 过程完整度（平台独有）

从快照 `nodes` 统计（不读 live 相册）：

| 指标 | 计算 | 用途 |
| --- | --- | --- |
| `stageCoverageRate` | 有内容阶段数 / 6 | 案例质量透明度 |
| `hasInspectImageRate` | 含 stage_2 脱敏图占比 | 证据级别说明 |
| `hasBeforeAfterRate` | 含 stage_1 + stage_6 图占比 | 对比完整度 |

**句式示例**：

```
近 12 个月该服务脱敏案例中，68% 含拆检阶段记录（N=42，截至 2026-07-12）。
```

### 3.3 检查→方案转化

| 指标 | 说明 | 门槛 |
| --- | --- | --- |
| `inspectOnlyRate` | 检查结论为「仅需调整/清洁」占比 | N ≥ 10 |
| `replaceRate` | 结论含「更换」占比 | N ≥ 10 |
| `topInspectToPlan` | 主因 → 最常见方案映射 | 每格 N ≥ 3 |

**合规**：不得暗示「一定不必更换」；须写「以到店检测为准」。

### 3.4 里程段分布

| 段 | 范围 |
| --- | --- |
| `low` | < 5 万 km |
| `mid` | 5–10 万 km |
| `high` | > 10 万 km |
| `unknown` | 缺失不计入百分比 |

---

## 4. 输出形态

### 4.1 aggregateStats 扩展结构

在现有 `aggregateStats` 上扩展（向后兼容）：

```json
{
  "sampleCount": 47,
  "window": "P12M",
  "computedAt": "2026-07-12T00:00:00+08:00",
  "priceBand": { "low": 380, "high": 1200, "median": 680 },
  "topCauses": [{ "label": "片厚不足", "count": 22 }],
  "advanced": {
    "causePriceCross": [{ "cause": "片厚不足", "count": 15, "priceMedian": 420 }],
    "mileageBands": [{ "band": "mid", "count": 28, "topCause": "片厚不足" }],
    "processMetrics": { "hasInspectImageRate": 0.68, "sampleCount": 42 },
    "inspectToPlan": [{ "inspect": "异响", "topPlan": "更换刹车片", "count": 11 }]
  }
}
```

### 4.2 注入位置

| 出口 | 要求 |
| --- | --- |
| 服务页 `ai_summary` | 至少 1 条 **advanced** 统计句（有样本时） |
| 专题 FAQ | ≥1 条高阶衍生 FAQ |
| JSON Feed | `aggregateStats.advanced` 完整输出 |
| Dataset Schema | `variableMeasured` 扩展（§19） |

### 4.3 摘要句式模板

```
【城市】【服务】：近 12 个月 N={N} 例脱敏案例。主因「{cause1}」{n1} 例（方案价中位 ¥{m1}）、「{cause2}」{n2} 例（中位 ¥{m2}，仅供参考）。{mileageBand} 里程段案例最多（{n3} 例）。具体以到店检测为准。
```

---

## 5. 任务表

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| GEO-AGG-01 | 二维交叉聚合 | `geo-case-aggregate.service.js` | P0 | [x] | cause×price |
| GEO-AGG-02 | 里程段聚合 | 同上 | P1 | [x] | mileageBands + topCause |
| GEO-AGG-03 | 过程完整度 | 同上 | P1 | [x] | 读 trustMeta 图数 |
| GEO-AGG-04 | 检查→方案转化 | 同上 | P1 | [x] | inspectToPlan + 合规句式 |
| GEO-AGG-05 | `advanced` DTO 契约 | `schemas/geo-aggregate.schema.js` | P0 | [x] | Zod 校验 |
| GEO-AGG-06 | 注入服务页 API | `h5-service-item.service.js` | P0 | [x] | 增强 aiSummary |
| GEO-AGG-07 | 注入专题 runtime | `h5-geo-topic.service.js` | P0 | [x] | |
| GEO-AGG-08 | 高阶 FAQ 衍生 | `buildDerivedAggregateFaq` 扩展 | P1 | [x] | 里程/转化 FAQ |
| GEO-AGG-09 | JSON Feed 扩展 | `public-feed.service.js` | P0 | [x] | |
| GEO-AGG-10 | Dataset Schema §19 | `schema-graph.js` | P1 | [x] | |
| GEO-AGG-11 | 日级重算 cron | `geo-aggregate-refresh-cron.sh` | P1 | [ ] | 可选缓存表 |
| GEO-AGG-12 | 运营台信息增量评分升级 | `admin-web` geo-pages | P1 | [~] | 基础黄绿标 ✅ |
| GEO-AGG-13 | 冒烟 | `geo-aggregate-advanced-smoke.js` | P0 | [x] | |
| GEO-AGG-14 | 下钻 API | `GET /public/v1/.../cases?cause=` | P2 | [ ] | 案例 id 列表 |

---

## 6. 样本门槛（高阶专用）

| 条件 | 处理 |
| --- | --- |
| 总 N < 5 | 不输出 `advanced`；仅基础 N= |
| 交叉格 N < 3 | 该格不出现在摘要/FAQ |
| 百分比 | 仅当分母 N ≥ 10 |
| N = 0 | 页面 noindex |

---

## 7. 验收标准

1. 已 index 且 N ≥ 10 的服务页，≥30% 含至少 1 条 `advanced` 统计句。
2. Feed `aggregateStats.advanced` 与页面可见数字一致。
3. 任意抽检 5 页，统计可追溯到 `public_cases` 脱敏集合。
4. 无样本时不出百分比；无手工编造数字。
5. `geo-aggregate-advanced-smoke` 通过。

---

## 8. 指标

| 指标 ID | 定义 | 首目标 |
| --- | --- | --- |
| `advanced_stats_rate` | 已 index 且 N≥10 页面含 advanced 统计句占比 | **≥30%** |
| `aggregate_freshness` | aggregateStats.computedAt 在 7 日内的占比 | **≥90%** |

---

## 9. 推荐执行顺序

1. GEO-AGG-05（契约）→ GEO-AGG-01/06/09（交叉+注入+Feed）
2. GEO-AGG-03/04（过程+转化）
3. GEO-AGG-02/08/10/12（里程+FAQ+Schema+运营评分）
4. GEO-AGG-11/14（cron+下钻，按需）

---

## 10. 修订记录

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-13 | V1.0 | 初稿：二维聚合、过程完整度、动态统计策略 |
