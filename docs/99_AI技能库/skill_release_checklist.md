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

## 检查范围

1. 设计体系
2. 组件复用
3. 价格合规
4. 隐私脱敏
5. 状态处理（loading/empty/error）
6. 安全区适配
7. 分享内容
8. 错误处理
9. 文案合规
10. 是否残留 mock 数据

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
| 奖励文案 | |
| 分享 | |

## 已执行的子检查

- [ ] design-system-check
- [ ] component-usage-review
- [ ] price-compliance（如适用）
- [ ] privacy-desensitization（如适用）

## 上线建议

1.
2.
3.
```

## 约束

- 发现高风险合规问题时，必须建议阻塞上线。
- 不要只输出「没问题」，必须列出检查过的项。
