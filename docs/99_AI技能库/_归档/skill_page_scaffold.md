# Skill: Page Scaffold

## 目标

按照项目规范生成页面骨架。

## 使用场景

- 新增用户端页面
- 新增商家端页面
- 新增运营端页面
- 新增 H5 公开页

运营 **Web 审核台**（`admin-web/`）请用 **`skill_ops_admin_scaffold.md`**，勿与本 skill 混用。

## 必读文档

- `docs/00_设计规范/00_辙见平台设计体系.md`
- `docs/00_设计规范/01_设计令牌_tokens.md`
- `docs/00_设计规范/02_组件API规范.md`
- 对应模块业务 PRD（`docs/02_*` / `03_*` / `04_*` / `05_*`）

## 页面生成原则

1. 优先组合已有组件。
2. WXSS 使用 token。
3. 页面必须包含 loading、empty、error 状态。
4. 涉及底部操作必须使用 safe-area（`fixed-bottom-bar` 或 `safe-bottom`）。
5. 涉及价格必须使用 PriceDisplay。
6. 涉及价格说明必须使用 ComplianceNotice。
7. 涉及隐私必须使用 PrivacyBanner。
8. 涉及案例必须使用 CaseCard。
9. 涉及门店必须使用 StoreCard。
10. 涉及相册必须使用 AlbumNode。

## 输出格式

```md
# 页面生成计划

## 页面路径

## 页面目标

## 使用组件

| 组件 | 用途 |
|---|---|

## 状态设计

| 状态 | 展示 |
|---|---|
| loading | |
| empty | |
| error | |
| normal | |

## 数据结构

## 文件变更计划

| 文件 | 操作 |
|---|---|
```

确认后再生成代码。

## 约束

- 不要直接写大段业务假逻辑。
- 可以使用 mock 数据，但必须标注。
- 不要绕开组件 API。
