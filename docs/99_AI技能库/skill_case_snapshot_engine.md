# Skill: Case Snapshot Engine（快照引擎 · Backend）

## 目标

实现 **CaseSnapshot** 冻结、相册锁定、H5/Feed **只读快照**，消除 live album drift。

## 使用场景

- `CASE-SNAP-01`～`CASE-SNAP-08`
- 修改 `public-case.service.js`、`service-album.service.js`、`content.service.js`
- 撤回/再授权、`snapshotVersion` 版本化

## 必读

- [`13_案例全流程快照与GEO分层开发计划.md`](../04_维修过程相册/13_案例全流程快照与GEO分层开发计划.md) §3.1、§阶段 B
- `backend/src/schemas/` — 新增或扩展 snapshot schema（实现时）

## 两层边界（实现时硬编码）

### CaseSnapshot（`contentJson.snapshot` 或等价）

冻结于 **`POST …/authorization` 成功**（与 public-case 提交同事务优先）：

| 域 | 内容 |
| --- | --- |
| `nodes` | 脱敏 URL、stage、note（授权瞬间） |
| `title/summary/faultDesc/inspectResult/repairPlan` | 授权时生成或表单值 |
| `articleBody` | 授权时从 nodes 聚合 |
| `planAmount/vehicle/parts/evidenceItems` | 相册当时值 |
| `authorizationTier` | 用户档位 |
| `snapshotVersion` | 整数，再授权 +1 |
| `frozenAt` | ISO 时间 |

### 禁止写入 snapshot 的路径（公示后）

- `admin-case-article` 的 geo-content 写 title/body/nodes
- `approveAdminCase` 从 live album 重建全文
- `regenerate-article` 覆盖 snapshot 字段
- `case-geo-llm` adopt 写顶列/body

## 相册锁定（CASE-SNAP-02）

| 条件 | merchant save/complete |
| --- | --- |
| `completed` 且 **未** authorization | ✅ 允许 |
| 已有 `authorization` 提交（含 pending_review / public_approved） | ❌ 409 |
| 用户 **撤回** 后（相册回 editable 态） | ✅ 允许（直至再次授权） |

**409 文案**：「车主已提交授权，相册已锁定；如需修改请先由车主撤回公示。」

## 读侧真源（CASE-SNAP-06/07）

```text
H5 案例详情 / GET /user/cases/:id / JSON Feed case DTO
  → 只读 public_cases.contentJson.snapshot.*
  → 禁止 content.service 内 resolvePublicCaseNodes(liveAlbum) 覆盖 nodes
```

提炼层字段（aiSummary、seo、faq）从 `enrichment_json` 或约定字段读取，见 **`case-enrichment-geo`**。

## 撤回与再授权（CASE-SNAP-03/04/05）

| 动作 | 行为 |
| --- | --- |
| 用户撤回 | `public_cases.status=offline` 或等价留痕；**不** hard delete 审计行（实现定稿）；相册解锁 |
| 再授权 | 新 snapshot 包、`snapshotVersion++`、强制 `pending_review` |
| 归属校验 | `withdrawAuthorization(albumId, userId)` 必须校验 album 归属 |

**CASE-SNAP-08（已定稿）**：运营驳回/要求修改 **不** 解锁相册；仅用户撤回后可改。

## 实现检查清单

- [ ] 授权与 snapshot 写入同事务或补偿一致
- [ ] merchant save 在锁定态 409
- [ ] H5 nodes 与授权瞬间一致（改 album DB 不影响 pending/approved 展示）
- [ ] approve 只改 status + published_h5，不 rebuild snapshot
- [ ] 单测/冒烟：`case-snapshot-smoke.js`

## 输出格式（计划阶段）

```markdown
# Case Snapshot Engine 计划

## Schema 变更
- contentJson.snapshot 结构
- migration 要点

## API 行为变更
| 端点 | 前 | 后 |
| --- | --- | --- |

## 读侧切换点
- content.service 函数名
- public-feed.service 函数名

## 风险
- 存量案例回填策略
```

## 关联 skill

- 完成后：**`case-snapshot-check`**
- 脱敏 URL：**`privacy-desensitization-check`**
- 运营台 UI：**`ops-admin-scaffold`**
