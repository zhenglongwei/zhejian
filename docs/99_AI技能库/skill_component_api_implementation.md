# Skill: Component API Implementation

## 目标

按照组件 API 规范实现基础组件或业务组件。

## 使用场景

- 新增 Button、Tag、Card 等基础组件
- 新增 PriceDisplay、CaseCard、AlbumNode 等业务组件
- 扩展已有组件 API

## 必读文档

- `docs/00_设计规范/01_设计令牌_tokens.md`
- `docs/00_设计规范/02_组件API规范.md`
- `docs/00_设计规范/00_透明维修平台设计体系.md`（§8 组件库）

## 实现要求

1. 组件目录使用 kebab-case。
2. 文件结构为：`index.json` `index.wxml` `index.wxss` `index.ts` 或 `index.js`
3. 样式必须使用 token。
4. 类名使用 BEM。
5. 必须支持必要状态：loading、disabled、empty、error（按组件适用）
6. 事件命名符合组件 API 规范。
7. 不得在页面内复制组件样式。
8. 业务组件必须内置合规文案（尤其 PriceDisplay、ComplianceNotice）。

## 输出顺序

实现前必须先输出：

```md
# 组件实现计划

## 组件名称

## 组件路径

## Props

## Events

## Slots

## 状态设计

## 使用到的 Token

## 文件变更计划

| 文件 | 操作 | 说明 |
|---|---|---|
```

用户确认后再生成代码。

## 验收标准

- 组件可被页面直接引用
- 无硬编码颜色
- 无独立视觉体系
- API 与 `02_组件API规范.md` 一致
- 业务组件符合合规要求
