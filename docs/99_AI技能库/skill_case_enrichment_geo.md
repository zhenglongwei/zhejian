# Skill: Case Enrichment GEO（提炼层 · GEO）

## 目标

在 **不改 CaseSnapshot** 前提下，维护 **GeoEnrichmentLayer**（SEO/FAQ/专题/聚合统计），提升 AI 引用率。

## 使用场景

- `CASE-ENR-*`、`GEO-IGAIN-*`、`GEO-TOPIC-G*`
- `geo-case-aggregate.service.js`、`geo-page-generator.service.js`、`h5-geo-topic.service.js`
- `admin` 写 enrichment API；H5/Feed 展示顶栏摘要与 FAQ

## 必读

- [`13_案例全流程快照与GEO分层开发计划.md`](../04_维修过程相册/13_案例全流程快照与GEO分层开发计划.md) §3.2、§5
- [`09_GEO信息增量与RAG专线开发计划.md`](../09_SEO_GEO_AI内容基础设施/09_GEO信息增量与RAG专线开发计划.md)
- [`04_AI可引用摘要规范.md`](../09_SEO_GEO_AI内容基础设施/04_AI可引用摘要规范.md) §15

## GeoEnrichmentLayer 字段（可变）

| 字段 | 说明 |
| --- | --- |
| `aiSummary` | 页顶可引用摘要；须可含 N= 统计句 |
| `seoTitle` / `seoDescription` | 搜索/Bot |
| `faq[]` | 页内 FAQ；≥1 条案例衍生（有样本时） |
| `faqLinks[]` | 延伸阅读 |
| `schemaGraph` | JSON-LD |
| `topicMountIds[]` | 挂载 geo_pages |

**约束**：提炼层 wording 可改，**数字/价区/样本量不得与 snapshot 矛盾**；聚合统计来自 `public_cases` 脱敏集合。

## 规则 vs LLM（项目定稿建议）

| 层级 | 手段 |
| --- | --- |
| 专题/服务页聚合 | **规则必须**（`geo-case-aggregate`） |
| 单案 enrichment 模板 | **规则为主**（从 snapshot 抽取 + 合规模板） |
| 专题表述润色 | 可选 LLM P2，**禁止改 N=/价格** |
| 单案 snapshot | **禁止 LLM** |
| 商家 299 授权前润色 | 可选 LLM，写 **相册草稿**，打入下次 snapshot |
| 运营 LLM adopt 进 snapshot | **废止**（CASE-OPS-04） |

## 与现有 IGAIN 代码关系

- ✅ 已完成：`geo-page-generator` 聚合摘要、`h5-geo-topic` 运行时注入、`public-feed`
- 🔜 待做：`enrichment_json` 与 snapshot 分表/分字段；H5 `case-render` 分块渲染

## 页面/Feed 一致性

```text
可见 HTML aiSummary/FAQ
  ≡ GET /public/v1/cases/{slug}.json 同字段
  ≡ JSON-LD 中对应描述（不含 snapshot 未展示事实）
```

改 enrichment **不** bump `snapshotVersion`；可 bump `enrichmentVersion`（实现时）。

## 禁止

- 无案例数据的「常见咨询汇总」类 index 文案（IGAIN 红线）
- 在 enrichment 中写 snapshot 没有的 planAmount/故障结论
- LLM 编造 N= 或百分比

## 冒烟

```bash
cd backend && node scripts/geo-aggregate-smoke.js
# 实现 CASE-ENR-06 后扩展 h5-chain-smoke enrichment 段
```

## 输出格式（计划阶段）

```markdown
# Case Enrichment GEO 计划

## 改 enrichment 的入口
- admin API / 运行时 inject / 种子脚本

## 不改 snapshot 的证明
- 列出仍写 contentJson.nodes 的路径（应为零）

## LLM  involvement
- 无 / 仅专题 P2 / 仅商家授权前

## 验收
- information_gain_rate 抽测
- Feed 与页面 diff
```

## 关联 skill

- 快照边界：**`case-snapshot-engine`**
- 主编排：**`case-snapshot-flow`**
- 检查：**`case-snapshot-check`**
