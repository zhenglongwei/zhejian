# Skill: Component Usage Review

## 目标

检查页面是否重复实现已有组件，推动组件复用。

## 使用场景

- 页面开发完成后
- 老页面重构前
- 合并代码前

## 必读文档

- `docs/00_设计规范/02_组件API规范.md`
- `docs/00_设计规范/00_辙见平台设计体系.md`（§8）

## 检查对象

重点检查是否重复实现：

Button、Tag、Card、Empty、Skeleton、PriceDisplay、OrderStatusBadge、Timeline、AlbumNode、CaseCard、StoreCard、ServiceCard、KeyInfoTable、AiSummaryBlock、PrivacyBanner、ComplianceNotice、FixedBottomBar

## 输出格式

```md
# 组件复用检查

## 总结

- 可复用组件数量：
- 重复实现数量：
- 建议重构优先级：

## 明细

| 文件 | 当前实现 | 应复用组件 | 建议 |
|---|---|---|---|

## 重构计划

1.
2.
3.
```

## 约束

- 默认只检查，不直接修改。
- 如果页面差异很小，应优先扩展组件 API。
- 不要为单个页面复制组件样式。
