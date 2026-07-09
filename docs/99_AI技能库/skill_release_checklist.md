# Skill: Release Checklist

## 目标

上线前进行设计、组件、合规、交互、状态完整性检查。

## 使用场景

- 发版前
- 合并 main 前

## 执行方式

依次调用或合并以下检查项（可只读对应 skill 的检查范围）：

1. `skill_design_system_check.md`
2. `skill_component_usage_review.md`
3. `skill_price_compliance_check.md`（涉及价格的页面）
4. `skill_privacy_desensitization_check.md`（涉及相册/案例的页面）
5. `skill_tokens_sync.md`（若本版本改过 token）
6. **`skill_case_snapshot_check.md`**（卷九或改动 public-case / content.service / 案例 H5 / 商家润色 / admin-case 时）

**卷九快照专项（CASE-FLOW-04）**：凡本版本触及上列路径，**必须先**跑 `case-snapshot-check`，再汇总进本报告；不得仅用 `privacy-desensitization-check` 代替快照分层检查。

自动化冒烟（本地 API 已启动时）：

```bash
cd backend && node scripts/case-snapshot-smoke.js          # FLOW-01～03
cd backend && npm run case:enrichment-feed-smoke           # ENR → Feed（若改提炼层）
```

## 检查范围

1. 设计体系
2. 组件复用
3. 价格合规
4. 隐私脱敏（含 **快照只读** 子集，见 `skill_privacy_desensitization_check.md` §快照只读）
5. 状态处理（loading/empty/error）
6. 安全区适配
7. 分享内容
8. 错误处理
9. 文案合规
10. 是否残留 mock 数据
11. **相册授权后锁定**（merchant save/complete → 409）
12. **快照不可变**（`public_approved` 后无 snapshot 写路径；`approveAdminCase` 不 live rebuild）
13. **H5/Feed 无 drift**（读侧不 merge live album；FLOW-02 可脚本回归）

## 输出格式

```md
# 上线前检查报告

## 总体结论

可以上线 / 需修改后上线 / 不建议上线

## 阻塞问题

| 问题 | 文件 | 原因 | 修改建议 |
|---|---|---|---|

## 非阻塞问题

| 问题 | 文件 | 建议 |
|---|---|---|

## 合规检查

| 场景 | 结果 |
|---|---|
| 价格 | |
| 事故车 | |
| 历史案例 | |
| 隐私脱敏 | |
| **快照只读（卷九）** | |
| **相册授权后锁定** | |
| **H5/Feed 无 live drift** | |
| **enrichment 不改 snapshot 事实** | |
| 奖励文案 | |
| 分享 | |

## 已执行的子检查

- [ ] design-system-check
- [ ] component-usage-review
- [ ] price-compliance（如适用）
- [ ] privacy-desensitization（如适用；卷九须含 §快照只读）
- [ ] case-snapshot-check（卷九 / 案例快照相关改动；**先于**汇总合规表）

## 上线建议

1.
2.
3.
```

## 约束

- 发现高风险合规问题时，必须建议阻塞上线。
- 不要只输出「没问题」，必须列出检查过的项。
