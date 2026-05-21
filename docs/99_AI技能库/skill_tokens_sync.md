# Skill: Tokens Sync

## 目标

同步设计令牌文档和 `styles/tokens.wxss`，保证设计文档与代码一致。

## 使用场景

- 新增颜色 token
- 新增字号 token
- 新增标签色
- 新增组件尺寸
- 修改设计体系

## 必读文档

- `docs/00_设计规范/01_设计令牌_tokens.md`
- `styles/tokens.wxss`

## 工作流程

1. 对比文档和 WXSS token 是否一致。
2. 找出只存在于文档、不存在于代码的 token。
3. 找出只存在于代码、不存在于文档的 token。
4. 检查命名是否符合规范。
5. 检查是否存在重复语义 token。
6. 输出同步方案。
7. 等用户确认后再修改。

## Token 命名要求

- 品牌色：`--color-primary-*`
- 文本色：`--color-text-*`
- 背景色：`--color-bg-*`
- 边框色：`--color-border-*`
- 功能色：`--color-success` / `--color-warning` / `--color-danger` / `--color-info`
- 标签色：`--tag-业务语义-fg` / `--tag-业务语义-bg`
- 字号：`--font-*`
- 间距：`--space-*`
- 圆角：`--radius-*`
- 阴影：`--shadow-*`
- 层级：`--z-*`

## 输出格式

```md
# Tokens 同步检查

## 差异摘要

| 类型 | 数量 |
|---|---|
| 文档有，代码无 | |
| 代码有，文档无 | |
| 命名不规范 | |
| 建议废弃 | |

## 差异明细

| Token | 文档 | 代码 | 建议 |
|---|---|---|---|

## 建议修改计划

1.
2.
3.
```

## 约束

- 不允许直接删除 token（需说明废弃与迁移）。
- 不允许随意改业务页面。
- 修改前必须说明影响范围。
