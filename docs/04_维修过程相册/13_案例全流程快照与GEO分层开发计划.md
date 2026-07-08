# 案例全流程 · 快照分层与 GEO 提炼开发计划

> **生效日期**：2026-07-08  
> **状态**：定稿（产品原则已确认）· **待开发**  
> **关联**：[`00_Phase1_服务相册产品口径.md`](./00_Phase1_服务相册产品口径.md) · [`07_案例生成规则.md`](./07_案例生成规则.md) · [`03_服务相册流程.md`](./03_服务相册流程.md) · [`06_平台运营后台/04_公开案例审核.md`](../06_平台运营后台/04_公开案例审核.md) · [`09_招商方案和收费策略.md`](../01_项目总览与业务架构/09_招商方案和收费策略.md) · GEO 专项 [`09_GEO信息增量与RAG专线开发计划.md`](../09_SEO_GEO_AI内容基础设施/09_GEO信息增量与RAG专线开发计划.md)  
> **主计划索引**：[`docs/00_开发计划.md`](../00_开发计划.md) §2.7（新增）

---

## 1. 产品定调（2026-07-08 确认）

### 1.1 一句话

**商家制造案例 → 用户决定是否公示 → 平台只做合法合规 → 公示后案例快照不可改 → 平台在快照之外做 GEO 提炼以提升 AI 引用。**

### 1.2 角色分工

| 角色 | 职责 | 不做 |
| --- | --- | --- |
| **商家** | 创建相册、六阶段留档、标记完工；**授权前**可优化内容（含付费润色）；留档质量自负 | 不能替用户公示/撤回；不能改用户已授权后的相册 |
| **用户（车主）** | 完工后几乎拥有一切公示权：授权、撤回、再授权；不对留档完整度负责 | 不能改已冻结快照；不能改商家留档 |
| **辙见平台** | 脱敏、合规审核（通过/驳回/下线）；**提炼层** GEO/SEO/专题/FAQ；收录与探测 | **不改案例快照一字**；不做交易撮合；不替商家保证留档质量 |

### 1.3 已确认的关键决策

| # | 决策 | 选项 |
| ---: | --- | --- |
| D1 | 相册编辑锁定时机 | **用户首次提交授权/公示意图后**，相册对商家只读 |
| D2 | 案例 vs 提炼层 | **用户点授权瞬间**整包快照冻结（含当时生成的标题/正文/节点）；之后仅 **提炼层** 可改 |
| D3 | 已公示案例 | 快照 **一个字不能改**；FAQ/GEO/SEO/专题/聚合 FAQ **可随时改** |
| D4 | 撤回后再授权 | **每次再授权 = 强制重审 + 新快照**（不论相册是否变化） |
| D5 | 商家套餐润色 | **商家在小程序发起**，仅 **用户授权前**；授权后不再改 |
| D6 | GEO 大模型 | **见 §5 专业建议**（产品待采纳） |

---

## 2. 目标全流程

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ 小程序 · 商家端                                                          │
│  创建相册 → 六阶段留档 → [可选: 299 润色助手] → 标记完工(completed)      │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ 完工后、授权前：商家仍可 save
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 小程序 · 用户端                                                          │
│  查看相册 → 脱敏预览 → 提交授权 ──────────────► 🔒 相册锁定              │
│                      │                                                   │
│                      └──► 生成 CaseSnapshot v1（整包冻结）               │
│                           public_cases.status = pending_review           │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 运营后台 · 合规审核（仅合法合规，不优化内容）                              │
│  通过 → public_approved + published_h5                                   │
│  驳回/要求修改 → 用户可撤回 → 相册解锁？* → 再授权 → 新快照 v2 + 重审      │
│  *见 CASE-SNAP-08：驳回后是否解锁相册由合规态定义                         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 公开网站 H5 · 读 CaseSnapshot（不可 drift）                               │
│  案例页 = 快照.nodes / 快照.title / 快照.articleBody …                  │
│  + GeoEnrichmentLayer（可变）：aiSummary_enriched / seo / 页内FAQ / Feed  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 辙见 GEO 层（与商家/用户无关）                                            │
│  意图专题 geo_pages · 聚合统计 FAQ · JSON Feed · Schema · 探测周报        │
│  规则聚合为主；可选 LLM 仅润色专题表述，不改动快照数字与事实                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 两层数据模型

### 3.1 CaseSnapshot（案例快照 · 不可变）

**冻结时机**：`POST /user/service-albums/:id/authorization` 成功时（与 `public-case` 提交同事务或紧耦合）。

| 字段域 | 来源 | 公示后 |
| --- | --- | --- |
| `snapshot.nodes` | 相册节点 + 脱敏 URL | ❌ 不可改 |
| `snapshot.images` | 脱敏图清单 | ❌ 不可改 |
| `snapshot.title/summary/faultDesc/inspectResult/repairPlan` | 授权时规则生成或商家已填 | ❌ 不可改 |
| `snapshot.articleBody` | 授权时从 nodes 聚合 | ❌ 不可改 |
| `snapshot.planAmount/vehicle/parts` | 相册当时值 | ❌ 不可改 |
| `snapshot.authorizationTier` | 用户授权档 | ❌ 不可改 |
| `snapshot.version` | 自增；每次再授权 +1 | 只增 |

**读侧真源**：H5 案例详情、JSON Feed 案例段、小程序案例详情（若仍有）**只读 snapshot**，禁止 `resolvePublicCaseNodes(liveAlbum)`。

### 3.2 GeoEnrichmentLayer（提炼层 · 可变）

**不写入快照**；挂于 `public_cases.enrichment_json` 或独立表 `case_geo_enrichment`。

| 字段 | 说明 | 谁维护 |
| --- | --- | --- |
| `aiSummary`（页顶可引用摘要） | 可从快照派生 + 聚合统计句 | 平台规则 / 可选 LLM 润色 |
| `seoTitle` / `seoDescription` | 搜索与 Bot | 平台 |
| `faq[]` | 页内 FAQ（含案例衍生统计 FAQ） | 平台 |
| `faqLinks[]` | 延伸阅读 | 平台 |
| `schemaGraph` | JSON-LD | 平台 |
| `topicMounts[]` | 挂载的 geo_pages id | 平台自动 + 运营 |

**原则**：提炼层可改 wording，但 **不得 contradict 快照事实**（价格、故障、节点数量等以快照为准）；聚合统计须带 N= 且来自 `public_cases` 脱敏集合。

---

## 4. 当前实现 vs 目标差距

| # | 目标原则 | 当前实现 | 差距 | 优先级 |
| ---: | --- | --- | --- | ---: |
| G1 | 用户授权后相册锁定 | `saveMerchantServiceAlbum` 无状态拦截 | 商家仍可改节点/图 | **P0** |
| G2 | H5 读快照 | `content.service` 每次 live merge album nodes | 已公示案例过程图可「漂移」 | **P0** |
| G3 | 授权时冻结整包 | `buildCaseDraft` 可 upsert 覆盖；无 `snapshotVersion` | 无正式快照语义 | **P0** |
| G4 | 公示后快照不可改 | 运营 `PUT geo-content` / `regenerate` 可改 title/body/aiSummary | 与 D3 冲突 | **P0** |
| G5 | 审核通过不应用 live album | `approveAdminCase` 从 live album 重建全文 | 覆盖授权快照 | **P0** |
| G6 | 再授权强制重审 | 撤回删行；再授权 upsert 语义不清 | 需版本化 + pending_review | **P0** |
| G7 | 撤回校验车主 | `withdrawAuthorization` 缺 userId 归属校验 | 安全风险 | **P0** |
| G8 | 299 润色授权前 | LLM 在运营台、与套餐无关 | 需商家端 + plan gate | **P1** |
| G9 | GEO 专题不改快照 | IGAIN 已分层；单案 ops LLM 仍写顶列 | 需拆 enrichment | **P1** |
| G10 | 合规审核不「优化内容」 | 运营台 GEO 编辑器过重 | UI/权限收口 | **P1** |

---

## 5. GEO：固定规则 vs 大模型 · 专业建议

### 5.1 结论（建议采纳）

| 层级 | 建议 | 理由 |
| --- | --- | --- |
| **CaseSnapshot** | **禁止 LLM**（授权后永远不改） | 信任来自「用户授权 + 不可篡改」；LLM 改写 = 平台替商家/用户说话 |
| **商家授权前润色（299）** | **可选 LLM**，商家确认后写入相册草稿 | 符合「质量自负 + 付费增值」；不触及已授权快照 |
| **单案提炼层（Enrichment）** | **规则为主**（模板 + 快照字段抽取 + 合规校验） | 足够生成 SEO/FAQ；与快照一致性好 |
| **专题/聚合页（IGAIN/TOPIC）** | **规则聚合必须**（N=、价区、主因分布） | 信息增量 = AI 编不出的数字；这是 citation 核心 |
| **专题表述润色** | **可选 LLM（P2）**，仅对 **已固定的统计句** 做 readability，**禁止改数字** | 边际提升可读性；失败不影响 citation |
| **运营台案例 LLM diff（现 GEO-CITE-C）** | **废止或降级**：仅允许在 **pending_review 且未冻结** 时辅助运营看合规，**不得 adopt 进快照**；公示后禁用 | 与 D3 冲突 |

### 5.2 为什么不建议「全用大模型做 GEO」

1. **可替代性**：无 N= 的散文，大模型自己就能生成，不会被引用。  
2. **信任风险**：用户/商家已确认快照后，LLM 改 wording 仍可能构成「被平台改写过」的感知。  
3. **一致性**：Feed / Schema / 页面三处需一致；规则 + 结构化字段更易保证。  
4. **成本与合规**：LLM 幻觉与禁词（100% 修好、全网最低）风险高于规则模板。

### 5.3 建议验收指标（沿用 GEO 北极星）

- `information_gain_rate`：提炼层/专题含 N= 统计句占比  
- `prompt_probe_citation_rate`：探测引用率（规则稿足够验证假设）  
- **不**以「摘要文学性」为主指标  

---

## 6. 开发阶段与任务表

### 6.0 任务 ID 前缀

- `CASE-SNAP-*`：快照、锁定、读侧  
- `CASE-ENR-*`：提炼层拆分与 GEO  
- `CASE-MCH-*`：商家授权前润色（套餐）  
- `CASE-OPS-*`：运营台合规收口  
- `CASE-DOC-*`：PRD/口径同步  

---

### 阶段 A · 文档与口径收口（P0）

> **先改文档再改代码**，避免实现与 PRD 再次偏离。

| ID | 任务 | 涉及文档 | 优先级 | 状态 |
| ---: | --- | --- | ---: | ---: |
| CASE-DOC-01 | Phase1 口径 § 快照分层、授权锁定 | `00_Phase1_服务相册产品口径.md` | P0 | [ ] |
| CASE-DOC-02 | 流程 §7 授权锁定、再授权重审 | `03_服务相册流程.md` | P0 | [ ] |
| CASE-DOC-03 | 案例生成规则 § 快照 vs 提炼层 | `07_案例生成规则.md` | P0 | [ ] |
| CASE-DOC-04 | 运营审核 § 合规-only、禁止改快照 | `04_公开案例审核.md` | P0 | [ ] |
| CASE-DOC-05 | 299 润色边界（授权前/商家发起） | `09_招商方案和收费策略.md` | P1 | [ ] |
| CASE-DOC-06 | 数据结构：snapshot / enrichment 字段 | `docs/11_数据结构与状态机/` 新增 § | P0 | [ ] |

---

### 阶段 B · 快照冻结与相册锁定（P0）

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| CASE-SNAP-01 | 授权提交时写入 `contentJson.snapshot` + `snapshotVersion` | `public-case.service.js` | P0 | [x] | 含 nodes 脱敏 URL、articleBody、授权档 |
| CASE-SNAP-02 | 相册锁定：`authorization` 后拒绝 merchant save/complete | `service-album.service.js` | P0 | [x] | 409 + 明确文案 |
| CASE-SNAP-03 | 撤回 → `offline` 留痕 + 相册解锁（仅 rejected/withdrawn） | `service-album.service.js` | P0 | [ ] | 不再 hard delete 或保留 audit 行 |
| CASE-SNAP-04 | 再授权：`snapshotVersion++`、强制 `pending_review` | `public-case.service.js` | P0 | [ ] | 旧 URL slug 策略见 B05 |
| CASE-SNAP-05 | 撤回/再授权 userId 归属校验 | `service-album.service.js` | P0 | [ ] | 安全 |
| CASE-SNAP-06 | H5/API 读侧 **只读 snapshot.nodes** | `content.service.js` | P0 | [x] | 删除 live merge |
| CASE-SNAP-07 | JSON Feed / Bot 预渲染对齐 snapshot | `public-feed.service.js` | P0 | [x] | 经 getCaseDetail 对齐 snapshot |
| CASE-SNAP-08 | 驳回 `need_modify` 是否解锁相册 | 产品定稿 | P0 | [ ] | **建议**：驳回且用户未撤回 → 保持锁定，仅允许用户撤回后商家改 |

**阶段 B 验收**：

1. 授权后 merchant save 返回 409；  
2. 授权后改 album DB 不影响已生成 pending 快照；  
3. H5 案例页 nodes 与授权瞬间一致；  
4. 撤回后再授权必进 pending_review，snapshotVersion=2。

---

### 阶段 C · 运营合规收口（P0）

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| CASE-OPS-01 | `approveAdminCase` **不再**从 live album 重建快照 | `admin-case.service.js` | P0 | [ ] | 仅改 status + published_h5 |
| CASE-OPS-02 | 拆分 API：`PUT enrichment` vs 禁止 `PUT snapshot` | `admin-case-article.service.js` | P0 | [ ] | |
| CASE-OPS-03 | 禁用公示后 `regenerate-article` 写快照字段 | `admin-case-article.service.js` | P0 | [ ] | |
| CASE-OPS-04 | 禁用公示后 LLM adopt 写 title/body | `admin-case-geo-llm.service.js` | P0 | [ ] | pending 可保留只读 preview |
| CASE-OPS-05 | admin-web UI：快照只读 + 提炼层编辑区 | `admin-web/.../case-review/detail` | P1 | [ ] | 合规审核文案 |
| CASE-OPS-06 | 举报下线保留快照 audit | `admin-report.service.js` | P1 | [ ] | status=offline |

---

### 阶段 D · 提炼层与 GEO 串联（P1）

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| CASE-ENR-01 | `enrichment_json` schema + 迁移 | migration + schema | P1 | [ ] | 从 contentJson.geo 拆出 |
| CASE-ENR-02 | H5 案例页：snapshot 正文 + enrichment 顶栏/FAQ | `case-render.js` | P1 | [ ] | |
| CASE-ENR-03 | 专题挂载不改快照；`mountCaseOnGeoPages` 只写 enrichment/topic | `case-article-publish.service.js` | P1 | [ ] | 已有挂载保留 |
| CASE-ENR-04 | IGAIN 聚合 FAQ 写入 enrichment / 专题 | 已有 `geo-case-aggregate` | P1 | [ ] | 与 TOPIC-G ✅ 衔接 |
| CASE-ENR-05 | 提炼层变更不 bump snapshotVersion | 服务层 | P1 | [ ] | 只写 enrichment 版本 |
| CASE-ENR-06 | 冒烟：snapshot 不变前提下改 enrichment → Feed 更新 | `h5-chain-smoke.js` | P1 | [ ] | |

---

### 阶段 E · 商家套餐润色（P1）

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| CASE-MCH-01 | 商家端「内容优化」入口（completed + 未授权） | `packageMerchant/pages/album/` | P1 | [ ] | |
| CASE-MCH-02 | plan gate：`OPTIMIZE_299` 可用 LLM；免费/99 仅规则建议 | `merchant-subscription.service.js` | P1 | [ ] | |
| CASE-MCH-03 | 润色写相册草稿，**不**写 public_cases | 新 service | P1 | [ ] | 商家确认后 save |
| CASE-MCH-04 | 授权时将草稿一并打入 snapshot | `public-case.service.js` | P1 | [ ] | |
| CASE-MCH-05 | 运营台移除「代商家润色」入口 | admin-web | P2 | [ ] | 与 D5 一致 |

---

### 阶段 F · 全链路验收（P0）

| ID | 任务 | 说明 | 优先级 | 状态 |
| ---: | --- | --- | ---: | ---: |
| CASE-FLOW-01 | E2E 脚本：商家建册→完工→用户授权→审核→H5 | `scripts/case-snapshot-smoke.js` | P0 | [ ] |
| CASE-FLOW-02 | 漂移回归：授权后改 album 不影响 H5 | 自动化 | P0 | [ ] |
| CASE-FLOW-03 | 撤回→再授权→重审→新 snapshotVersion | 自动化 | P0 | [ ] |
| CASE-FLOW-04 | `release-checklist` 增补快照项 | skill | P1 | [ ] |
| CASE-FLOW-05 | `privacy-desensitization-check` 对齐快照只读 | skill | P1 | [ ] |

---

## 7. 推荐执行顺序

```text
A 文档 (CASE-DOC-01～06)
  → B 快照+锁定 (CASE-SNAP-01～07)     ← P0 阻塞
  → C 运营收口 (CASE-OPS-01～04)
  → F 验收 (CASE-FLOW-01～03)
  → D 提炼层 (CASE-ENR-*)
  → E 商家润色 (CASE-MCH-*)
```

**与 GEO 专项关系**：

- 已完成 **GEO-IGAIN-A04 / TOPIC-G01/G02**（专题聚合）→ 归入 **阶段 D**，不改快照。  
- **废止**运营台对公示案例的 LLM adopt → **阶段 C**。  

---

## 8. 权限矩阵（目标态）

| 动作 | 商家 | 用户 | 平台运营 |
| --- | ---: | ---: | ---: |
| 编辑相册（完工后、授权前） | ✅ | ❌ | ❌ |
| 编辑相册（用户已授权） | ❌ | ❌ | ❌ |
| 发起授权/撤回/再授权 | ❌ | ✅ | ❌ |
| 合规通过/驳回 | ❌ | ❌ | ✅ |
| 改 CaseSnapshot | ❌ | ❌ | ❌ |
| 改 GeoEnrichment | ❌ | ❌ | ✅ |
| 改 geo_pages 专题/FAQ | ❌ | ❌ | ✅ |
| 授权前付费润色 | ✅（299） | ❌ | ❌ |
| 举报下线 | ❌ | ✅ | ✅ 处置 |

---

## 9. 进度汇总

| 阶段 | 任务数 | P0 | 状态 |
| --- | ---: | ---: | ---: |
| A 文档 | 6 | 5 | 待开发 |
| B 快照锁定 | 8 | 8 | 待开发 |
| C 运营收口 | 6 | 4 | 待开发 |
| D 提炼层 GEO | 6 | 0 | 待开发 |
| E 商家润色 | 5 | 0 | 待开发 |
| F 验收 | 5 | 3 | 待开发 |
| **合计** | **36** | **20** | **← 当前建议 Sprint** |

---

## 10. Agent Skills（正式开发前必读）

| Skill | 路径 | 何时用 |
| --- | --- | --- |
| **case-snapshot-flow** | `.cursor/skills/case-snapshot-flow/` | 任意 `CASE-*` 任务启动；跨端计划 |
| **case-snapshot-engine** | `.cursor/skills/case-snapshot-engine/` | `CASE-SNAP-*`、backend 快照/锁定 |
| **case-enrichment-geo** | `.cursor/skills/case-enrichment-geo/` | `CASE-ENR-*`、GEO 提炼层 |
| **case-snapshot-check** | `.cursor/skills/case-snapshot-check/` | 合并前 / CASE-FLOW 验收 |

全文：`docs/99_AI技能库/skill_case_snapshot_*.md` · 索引 `docs/99_AI技能库/00_使用说明.md`

**推荐对话起手**：

```
请读 docs/04_维修过程相册/13_案例全流程快照与GEO分层开发计划.md，
按 case-snapshot-flow 输出 CASE-SNAP-01 实现计划，确认后再写 backend 代码。
```

---

## 11. 修订记录

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2026-07-08 | V1.0 | 初稿：产品原则确认；快照/提炼分层；规则 vs LLM 建议；36 项任务 |
| 2026-07-08 | V1.1 | 新增 §10 Agent Skills 四套 skill |
