# Skill: WXSS Refactor

## 目标

把页面或组件中的硬编码样式替换为设计令牌和工具类。

## 使用场景

- 老页面样式治理
- Cursor 生成代码后清理
- 上线前样式检查

## 必读文档

- `docs/00_设计规范/01_设计令牌_tokens.md`
- `styles/tokens.wxss`

## 检查重点

1. 硬编码颜色
2. 硬编码字号
3. 硬编码圆角
4. 硬编码阴影
5. 不统一的间距
6. 自定义按钮样式
7. 自定义标签样式
8. 自定义价格样式

## 替换规则

| 当前写法 | 替换方向 |
|---|---|
| `#333` / `#1f2329` | `var(--color-text-primary)` 或 `.text-primary` |
| `#666` | `var(--color-text-secondary)` 或 `.text-secondary` |
| `#999` | `var(--color-text-tertiary)` 或 `.text-tertiary` |
| `#f5f5f5` | `var(--color-bg-page)` 或 `var(--color-bg-muted)` |
| `border-radius: 16rpx` | `var(--radius-md)` |
| `box-shadow`（卡片） | `var(--shadow-card)` 或 `.card--shadow` |
| 自定义 tag | `components/tag` 或 `.tag` + `.tag--*` |
| 自定义 button | `components/button` 或 `.btn` + `.btn--*` |
| 自定义价格字号 | `.text-price` / `.text-price-sm` |

## 输出格式

```md
# WXSS 重构建议

## 问题汇总

| 类型 | 数量 |
|---|---|

## 明细

| 文件 | 当前代码 | 建议替换 | 原因 |
|---|---|---|---|

## 修改计划

1.
2.
3.
```

## 约束

- 默认不要直接修改。
- 修改时保持页面视觉尽量不变。
- 不得新增 token，除非现有 token 无法表达语义（需先说明）。
