# 案例全流程 · 快照分层与 GEO 提炼开发计划

> **生效日期**：2026-07-08  
> **状态**：定稿（**2026-07-27 案例审核收口**：废相册合规阻塞审；完工→脱敏→案例人审；审前车主不可见；发布不再复审）· 部分已开发  
> **关联**：[`00_Phase1_服务相册产品口径.md`](./00_Phase1_服务相册产品口径.md) · [`07_案例生成规则.md`](./07_案例生成规则.md) · [`03_服务相册流程.md`](./03_服务相册流程.md) · [`06_平台运营后台/04_公开案例审核.md`](../06_平台运营后台/04_公开案例审核.md) · [`09_招商方案和收费策略.md`](../01_项目总览与业务架构/09_招商方案和收费策略.md) · GEO 专项 [`09_GEO信息增量与RAG专线开发计划.md`](../09_SEO_GEO_AI内容基础设施/09_GEO信息增量与RAG专线开发计划.md)  
> **主计划索引**：[`docs/00_开发计划.md`](../00_开发计划.md) §2.7 / §7.12

---

## 1. 产品定调（2026-07-08 确认 · **2026-07-27 修订**）

### 1.1 一句话

**商家制造留档 → 确认完工锁定 → 异步脱敏 → 平台案例人审（审公示案例稿）→ 通过后车主可看相册/案例并发布（**不再过审**）→ 快照不可改 → 平台在快照外做 GEO 提炼。撤回公开下线且不解锁商家。**

### 1.2 角色分工

| 角色 | 职责 | 不做 |
| --- | --- | --- |
| **商家** | 创建相册、六阶段留档、**确认并完工**；案例审驳回后改相册+案例稿再送审；留档质量自负 | 不能替用户公示/撤回；**确认完工后**不能改留档（驳回除外）；撤回后也不能改 |
| **用户（车主）** | 案例审通过前**不可看**相册；通过后查看并决定是否发布；撤回、再发布 | 不对留档完整度负责；不能改已冻结快照 |
| **辙见平台** | **案例审**：公示案例稿合法合规 + 脱敏风险（前期全量人审）；提炼层 GEO/SEO | **不改案例快照一字**；**不**在车主发布后再做人审；本期不做运营手工打码 |

### 1.3 已确认的关键决策

| # | 决策 | 选项 |
| ---: | --- | --- |
| D1 | **商家留档锁定（2026-07-27）** | **确认并完工后**锁定；**仅**案例审驳回可再编辑；**撤回不解锁** |
| D1b | **用户发布后锁定** | 与 D1 叠加；撤回仍锁定 |
| D1c | **车主可见性（2026-07-27）** | 案例审通过前**不可查看**整本相册；通过后开放 |
| D2 | 案例 vs 提炼层 | **用户点发布瞬间**整包快照冻结；之后仅 **提炼层** 可改 |
| D3 | 已公示案例 | 快照 **一个字不能改**；FAQ/GEO/SEO/专题/聚合 FAQ **可随时改** |
| D4 | 撤回后再发布 | **新 snapshotVersion**；**不再**强制重审（案例审已过） |
| D5 | 商家套餐润色 / AI 润色 | **仅确认并完工前**；完工后不可再改案例正文 |
| D6 | GEO 大模型 | **见 §5 专业建议** |
| D7 | **单闸门 · 案例审** | 完工后脱敏结束再人审公示案例；**废止**相册完工合规阻塞审与发布后复审 |
| D8 | **预脱敏** | 完工后异步 pre-mask；**脱敏结束（含失败）后**才升入运营待审；失败可重试或驳回商家 |
| D9 | ~~发布后人审~~ | **废止** |
| D10 | **案例审驳回** | 回到**商家**改相册+案例稿、再确认完工/再送审 |
| D11 | **废止旧路径** | 「相册合规阻塞」「发布后再审」「审前车主可看私密相册」 |

---

## 2. 目标全流程（案例审核收口 · 2026-07-27）

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ 小程序 · 商家端                                                          │
│  创建相册 → 六阶段留档 → [可选 AI 润色] → 确认并完工(completed)            │
│  商家锁定；车主端不可见                                                   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ pending_desensitize + 异步 pre-mask
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 脱敏结束（就绪 / 部分失败 / 失败）→ pending_review                        │
│  失败/需人工：详情标出；运营可重试脱敏或驳回商家（本期无运营手工打码）      │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 案例人审（唯一阻塞审）                                                     │
│  审：公示案例稿合法合规 + 脱敏图/OCR 风险                                  │
│  **不审**：六阶段齐全、整本私密相册                                        │
│  通过 → review_passed（不上线；车主可看相册/案例并发布）                    │
│  驳回 → rejected（解锁商家；车主仍不可见）                                  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 用户 · 脱敏预览 → 发布到公开网站                                           │
│  → CaseSnapshot 冻结 → 直接 public_approved / H5（不再过审）               │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
         H5 只读 CaseSnapshot + GeoEnrichmentLayer（可变）
```

### 2.1 「相册锁定 / 车主可见」白话

| 术语 | 含义 | 触发 |
| --- | --- | --- |
| **商家锁定** | 商家不能再改节点/图/案例稿 | **确认并完工**（待审/已通过/已发布/撤回后） |
| **车主不可见** | 车主不能打开服务相册详情 | **完工后至案例审通过前**（含驳回未再过审） |
| **解锁商家** | 商家可再编辑 | **仅**案例审驳回 |

**历史说明**：原「双闸门 A/B」「相册完工合规」任务已完成或废止为阻塞审；现行以 §1 / §2 与 `00_开发计划.md` §7.12 为准。

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
| G1 | A 通过后商家锁定 + 用户冻结展示 | 现仅「用户授权后」锁商家（SNAP-02） | 锁定时机偏晚 | **P0** |
| G2 | H5 读快照 | ~~live merge~~ | CASE-SNAP-06 ✅ | — |
| G3 | 授权时冻结整包 | ~~无 snapshot~~ | CASE-SNAP-01 ✅ | — |
| G4 | 公示后快照不可改 | 运营仍可改 title/body | CASE-OPS ✅ | — |
| G5 | 审核通过不 rebuild | approve 从 live album 重建 | CASE-OPS-01 ✅ | — |
| G6 | 再授权强制重审 | ~~撤回删行~~ | CASE-SNAP-03/04 ✅ | — |
| G7 | 撤回校验车主 | ~~缺校验~~ | CASE-SNAP-05 ✅ | — |
| G8 | 299 润色授权前 | LLM 在运营台 | CASE-MCH 待做 | **P1** |
| G9 | GEO 专题不改快照 | IGAIN 已分层 | CASE-ENR 待做 | **P1** |
| G10 | 合规审核不「优化内容」 | 运营台 GEO 编辑器过重 | UI/权限收口 | **P1** |
| G11 | 双闸门 A/B 分责 | 合规与脱敏混在「案例审核」 | CASE-GATE 待做 | **P0** |

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

- `CASE-GATE-*`：双闸门 A（完工合规）/ B（公示脱敏+用户内容）  
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
| CASE-DOC-01 | Phase1 口径 § 快照分层、授权锁定 | `00_Phase1_服务相册产品口径.md` | P0 | [x] | §4.5.7 |
| CASE-DOC-02 | 流程 §7 授权锁定、再授权重审 | `03_服务相册流程.md` | P0 | [x] | §7.7 |
| CASE-DOC-03 | 案例生成规则 § 快照 vs 提炼层 | `07_案例生成规则.md` | P0 | [x] | §19.3 |
| CASE-DOC-04 | 运营审核 § 合规-only、禁止改快照 | `04_公开案例审核.md` | P0 | [x] | §8.7 |
| CASE-DOC-05 | 299 润色边界（授权前/商家发起） | `09_招商方案和收费策略.md` | P1 | [x] | 299 套餐边界段 |
| CASE-DOC-06 | 数据结构：snapshot / enrichment 字段 | `docs/11_数据结构与状态机/` 新增 § | P0 | [x] | `07_案例快照与提炼层字段.md` |

---

### 阶段 B · 快照冻结与相册锁定（P0）

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| CASE-SNAP-01 | 授权提交时写入 `contentJson.snapshot` + `snapshotVersion` | `public-case.service.js` | P0 | [x] | 含 nodes 脱敏 URL、articleBody、授权档 |
| CASE-SNAP-02 | 相册锁定：`authorization` 后拒绝 merchant save/complete | `service-album.service.js` | P0 | [x] | 409 + 明确文案 |
| CASE-SNAP-03 | 撤回 → `offline` 留痕 + 相册解锁（仅 rejected/withdrawn） | `service-album.service.js` | P0 | [x] | 不再 hard delete；CaseReviewLog |
| CASE-SNAP-04 | 再授权：`snapshotVersion++`、强制 `pending_review` | `public-case.service.js` | P0 | [x] | offline 再公示；清 slug |
| CASE-SNAP-05 | 撤回/再授权 userId 归属校验 | `service-album.service.js` | P0 | [x] | 403 + 防重复授权 |
| CASE-SNAP-06 | H5/API 读侧 **只读 snapshot.nodes** | `content.service.js` | P0 | [x] | 删除 live merge |
| CASE-SNAP-07 | JSON Feed / Bot 预渲染对齐 snapshot | `public-feed.service.js` | P0 | [x] | 经 getCaseDetail 对齐 snapshot |
| CASE-SNAP-08 | B 驳回不解锁商家 | 产品定稿 | P0 | [x] | D9/D11：驳回回用户；仅撤回才解锁 |

**阶段 B 验收**（已完成项）：

1. 用户授权后 merchant save 返回 409（**待 GATE-A-03 前移到 A 通过**）；  
2. 授权后改 album DB 不影响 pending 快照（SNAP-06 ✅）；  
3. H5 nodes 与授权瞬间一致（SNAP-06 ✅）；  
4. 撤回后再授权 pending_review + snapshotVersion++（SNAP-03/04 ✅）。

---

### 阶段 B2 · 双闸门（P0 · **当前优先于 CASE-OPS**）

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| CASE-GATE-A-01 | 相册 `complianceStatus` 状态机（pending/passed/rejected） | `service-album.service.js` · schema | P0 | [x] | migration + complete 挂钩 |
| CASE-GATE-A-02 | 自动规则引擎（禁词/导流/OCR 风险摘要） | `album-compliance.service.js` | P0 | [x] | 禁词+外链/微信/手机 |
| CASE-GATE-A-03 | **A 通过后** merchant save 409 + 用户冻结展示 API 字段 | `service-album.service.js` · 用户详情页 | P0 | [x] | backend ✅；详情/评价/列表卡 `statusHint` ✅ |
| CASE-GATE-A-04 | 运营抽检队列「相册完工合规」 | `admin-album-compliance` · admin-web | P0 | [x] | list/detail + GateReviewNav |
| CASE-GATE-B-01 | 案例审核范围收窄为脱敏+用户侧内容 | `admin-case.service.js` · PRD | P0 | [x] | 合规类驳回归 A；gateScope API |
| CASE-GATE-B-02 | 结构化驳回原因 + 用户端可读 copy | API + 小程序 | P0 | [x] | backend + admin REJECT_REASONS + 用户 banner |
| CASE-GATE-B-03 | 用户驳回态：重试自动脱敏 / 手工脱敏 / 改评价 | 脱敏预览 · 评价页 | P0 | [x] | detail/engage gateActions + album-gate-actions |
| CASE-GATE-B-04 | B 驳回 **不** 调用相册解锁 | `service-album.service.js` | P0 | [x] | need_modify + 保持 authorization |

**阶段 B2 验收**：

1. A 未通过时用户看不到「授权公示」或见「门店处理中」；  
2. A 通过后用户详情见「门店已提交，内容待您确认」且商家 save 409；  
3. B 脱敏驳回：用户见原因并可重试脱敏，商家仍 409；  
4. B 评价驳回：用户改评价后重提交，不经商家改相册。

---

### 阶段 C · 运营合规收口（P0）

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| CASE-OPS-01 | `approveAdminCase` **不再**从 live album 重建快照 | `admin-case.service.js` | P0 | [x] | 有 snapshot 时只改 status + published_h5 |
| CASE-OPS-02 | 拆分 API：`PUT enrichment` vs 禁止 `PUT snapshot` | `admin-case-article.service.js` | P0 | [x] | `PUT /enrichment` + SNAPSHOT_FROZEN |
| CASE-OPS-03 | 禁用公示后 `regenerate-article` 写快照字段 | `admin-case-article.service.js` | P0 | [x] | 有 snapshot 时仅 refresh 提炼层 |
| CASE-OPS-04 | 禁用公示后 LLM adopt 写 title/body | `admin-case-geo-llm.service.js` | P0 | [x] | diff 只读 preview · adopt 409 |
| CASE-OPS-05 | admin-web UI：快照只读 + 提炼层编辑区 | `admin-web/.../case-review/detail` | P1 | [x] | CaseGeoEditor 快照冻结态 |
| CASE-OPS-06 | 举报下线保留快照 audit | `admin-report.service.js` | P1 | [x] | `report_offline` + snapshotPreserved 留痕 |

---

### 阶段 D · 提炼层与 GEO 串联（P1）

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| CASE-ENR-01 | `enrichment_json` schema + 迁移 | migration + schema | P1 | [x] | `case-enrichment.schema.js` + backfill |
| CASE-ENR-02 | H5 案例页：snapshot 正文 + enrichment 顶栏/FAQ | `case-render.js` | P1 | [x] | API 分层 + H5/Bot 同构 |
| CASE-ENR-03 | 专题挂载不改快照；`mountCaseOnGeoPages` 只写 enrichment/topic | `case-article-publish.service.js` | P1 | [x] | topicMountIds + geo_pages |
| CASE-ENR-04 | IGAIN 聚合 FAQ 写入 enrichment / 专题 | 已有 `geo-case-aggregate` | P1 | [x] | mount + backfill |
| CASE-ENR-05 | 提炼层变更不 bump snapshotVersion | 服务层 | P1 | [x] | persistCaseEnrichment 快照守卫 |
| CASE-ENR-06 | 冒烟：snapshot 不变前提下改 enrichment → Feed 更新 | `h5-chain-smoke.js` | P1 | [x] | verifyCaseEnrichmentFeedSegment |

---

### 阶段 E · 商家套餐润色（P1）

| ID | 任务 | 涉及文件 | 优先级 | 状态 | 备注 |
| ---: | --- | --- | ---: | ---: | --- |
| CASE-MCH-01 | 商家端「内容优化」入口（completed + 未授权） | `packageMerchant/pages/album/` | P1 | [x] | `edit` 入口 + `optimize` 页 |
| CASE-MCH-02 | plan gate：`OPTIMIZE_299` 可用 LLM；免费/99 仅规则建议 | `merchant-subscription.service.js` | P1 | [x] | |
| CASE-MCH-03 | 润色写相册草稿，**不**写 public_cases | 新 service | P1 | [x] | 商家确认后 save |
| CASE-MCH-04 | 授权时将草稿一并打入 snapshot | `public-case.service.js` | P1 | [x] | |
| CASE-MCH-05 | 运营台移除「代商家润色」入口 | admin-web | P2 | [x] | 快照冻结时隐藏 LLM 编辑 |

---

### 阶段 F · 全链路验收（P0）

| ID | 任务 | 说明 | 优先级 | 状态 |
| ---: | --- | --- | ---: | ---: |
| CASE-FLOW-01 | E2E 脚本：商家建册→完工→用户授权→审核→H5 | `scripts/case-snapshot-smoke.js` | P0 | [x] | FLOW-01 段 |
| CASE-FLOW-02 | 漂移回归：授权后改 album 不影响 H5 | `case-snapshot-smoke.js` | P0 | [x] | FLOW-02 段 |
| CASE-FLOW-03 | 撤回→再授权→重审→新 snapshotVersion | `case-snapshot-smoke.js` | P0 | [x] | FLOW-03 段 |
| CASE-FLOW-04 | `release-checklist` 增补快照项 | skill | P1 | [x] | 合规表 + 检查范围 11～13 |
| CASE-FLOW-05 | `privacy-desensitization-check` 对齐快照只读 | skill | P1 | [x] | §快照只读 10～15 |

---

## 7. 推荐执行顺序

```text
A 文档 (CASE-DOC-01～06)              ← ✅
  → B 快照+锁定 (CASE-SNAP-01～08)     ← ✅
  → B2 双闸门 (CASE-GATE-A/B)          ← ✅
  → C 运营收口 (CASE-OPS-01～06)       ← ✅
  → D 提炼层 (CASE-ENR-*)              ← ✅
  → E 商家润色 (CASE-MCH-*)            ← ✅
  → F 验收 (CASE-FLOW-01～05)          ← ✅
```

**与 GEO 专项关系**：

- 已完成 **GEO-IGAIN-A04 / TOPIC-G01/G02**（专题聚合）→ 归入 **阶段 D**，不改快照。  
- **废止**运营台对公示案例的 LLM adopt → **阶段 C**。  

---

## 8. 权限矩阵（目标态）

| 动作 | 商家 | 用户 | 平台运营 |
| --- | ---: | ---: | ---: |
| 编辑相册（完工后、**A 通过前**） | ✅ | ❌ | ❌ |
| 编辑相册（**A 通过后** / 用户已授权） | ❌ | ❌ | ❌ |
| 查看冻结留档（A 通过后） | ❌ | ✅ 只读 + 待确认提示 | ❌ |
| 发起授权/撤回/再授权 | ❌ | ✅ | ❌ |
| **A** 完工合规通过/驳回 | ❌ | ❌ | ✅（规则+抽检） |
| **B** 公示脱敏/用户内容通过/驳回 | ❌ | ❌ | ✅ |
| B 驳回后重试脱敏/改评价 | ❌ | ✅ | ❌ |
| 改 CaseSnapshot | ❌ | ❌ | ❌ |
| 改 GeoEnrichment | ❌ | ❌ | ✅ |
| 授权前付费润色 | ✅（299，A 前） | ❌ | ❌ |
| 举报下线 | ❌ | ✅ | ✅ 处置 |

---

## 9. 进度汇总

| 阶段 | 任务数 | P0 | 状态 |
| --- | ---: | ---: | ---: |
| A 文档 | 6 | 5 | **✅** |
| B 快照锁定 | 8 | 8 | **✅** |
| **B2 双闸门** | **8** | **8** | **✅** |
| C 运营收口 | 6 | 4 | **✅** |
| D 提炼层 GEO | 6 | 0 | **✅** |
| E 商家润色 | 5 | 0 | **✅** |
| F 验收 | 5 | 3 | **✅** |
| **合计** | **44** | **28** | **卷九 ✅** |

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
| 2026-07-08 | V1.2 | **双闸门定稿**：D7～D11；A=完工合规+偏信任冻结展示；B=脱敏+用户内容；CASE-GATE-A/B 八项；SNAP-08 收口 |
| 2026-07-09 | V1.3 | **阶段 E 完成**：CASE-MCH-01～05 商家授权前润色（套餐 gate + optimize 页 + snapshot 合并） |
| 2026-07-09 | V1.4 | **阶段 F 完成**：CASE-FLOW-04/05 release-checklist + privacy skill 对齐快照只读 |
| 2026-07-09 | V1.5 | **阶段 A 完成**：CASE-DOC-01～06 PRD/口径/数据结构同步 |
| 2026-07-09 | V1.6 | **CASE-OPS-06**：举报下线 `report_offline` 留痕，保留 `content_json.snapshot` |
| 2026-07-09 | V1.7 | **CASE-GATE-A-03 备注**：小程序详情/评价已接冻结提示；列表卡待补 |
