# Skill: Case Snapshot Check（快照分层检查）

## 目标

合并前/发版前验证 **快照不可变、提炼层可改、跨端一致**，默认**只报告不改代码**。

## 使用场景

- 卷九 `CASE-FLOW-*` 验收
- 改动 `public-case` / `content.service` / `admin-case` / H5 case-render 后
- 用户要求「检查快照有没有 drift」

## 必读

- [`13_案例全流程快照与GEO分层开发计划.md`](../04_维修过程相册/13_案例全流程快照与GEO分层开发计划.md) §4 差距表、§8 权限矩阵

## 检查项

### A. 相册锁定

- [ ] 用户 authorization 后 `saveMerchantServiceAlbum` → 409
- [ ] 撤回后 save 恢复（若产品如此定义）
- [ ] 驳回但未撤回时 save 仍 409

### B. 快照不可变

- [ ] `public_approved` 后无 API 写 snapshot.title/body/nodes
- [ ] `approveAdminCase` 不 rebuild 自 live album
- [ ] LLM adopt 不写 snapshot 域
- [ ] `snapshotVersion` 仅在再授权时递增

### C. H5 / Feed 不 drift

- [ ] `listCases` / `getCaseDetail` 不 merge live album nodes
- [ ] 授权后改 album DB，H5 案例 nodes 不变（可脚本测）
- [ ] Feed `aiSummary`/nodes 与 HTML 一致

### D. 提炼层

- [ ] enrichment 变更不修改 snapshot
- [ ] 聚合 FAQ 含 N=（有样本时）
- [ ] 无「常见咨询汇总」无案例 index 文案

### E. 权限与安全

- [ ] `withdrawAuthorization` 校验 userId 归属
- [ ] 运营台快照区只读；enrichment 区可编辑（若已实现 UI 拆分）
- [ ] 公开链仅脱敏 URL（`privacy-desensitization-check` 子集）

### F. 合规

- [ ] 用户授权路径：合规审核不 block GEO/脱敏进度（仅合规）
- [ ] 价格展示符合四型（`price-compliance-check` 子集）

## 输出格式

```markdown
# 案例快照分层检查报告

## 总体结论
通过 / 需修改 / 阻塞

## 阻塞项
| ID | 问题 | 文件/路径 | 违反原则 | 建议 |
| --- | --- | --- | --- | --- |

## 非阻塞项
| 问题 | 建议 |
| --- | --- |

## 权限矩阵抽检
| 动作 | 预期 | 实际 |
| --- | --- | --- |

## 建议下一步
1.
```

## 约束

- 默认不改代码；用户明确要求修复时再动
- 与 **`release-checklist`** 联用：本 skill 通过后再跑发版总检

## 关联 skill

- 修复快照引擎：**`case-snapshot-engine`**
- 修复 GEO 提炼：**`case-enrichment-geo`**
- 隐私：**`privacy-desensitization-check`**
