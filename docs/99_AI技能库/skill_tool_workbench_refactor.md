# Skill：单页工具台重构（UI-ALB-F）

## 适用场景

- 修改 `pages/mine/index`（冷启动单页 / 服务相册工具台）
- 调整相册 Hero、待办聚合、公示激励、H5 条件出口
- 文档与实现不一致时的对齐改造

## 必读

1. `docs/02_用户端小程序/12_我的页面与账户体系.md` §3 / §3.1
2. `docs/00_设计规范/11_工具相册UI线框.md` §1
3. `docs/00_设计规范/00_辙见平台设计体系.md` §10.1
4. `docs/00_开发计划.md` §7.6.8

## 模块顺序（真源 · UI-ALB-F-07）

```text
band → 工具说明（未登录）
→ 用户扉页（hub · 点击进个人中心）
→ 相册 Hero + 区头「全部 · 授权公示」
→ 待办条（仅相册更新/待授权）
→ 公示激励弱条
→ dock：设置 | 客服 | 商家
→ 条件 H5 → ComplianceNotice
```

## 已合并（勿在首页恢复长列表）

| 原菜单 | 去向 |
| --- | --- |
| 消息通知 | 设置内说明（微信服务通知） |
| 使用说明 | 设置 → 帮助 |
| 公开授权 | 相册区头「授权公示」 |
| 我的车辆 | 个人中心 `pages/mine/profile` |

## 用户态矩阵

| 状态 | 相册 Hero | H5 | 待办 | 公示激励 |
| --- | --- | --- | --- | --- |
| 未登录 | 登录引导 | 条件 ✅ | 隐藏 | 隐藏或弱链明细 |
| 已登录无相册 | empty + 扫一扫说明 | ❌ | 有则展示 | 弱卡 |
| 已登录有相册 | 1～2 档案卡 | ❌ | 有则展示 | 弱卡 |

## 组件与常量

| 用途 | 路径 |
| --- | --- |
| 页壳 | `components/tool-page-shell` |
| 用户扉页 | `components/mine-user-header` |
| 相册 Hero | `components/album-card` · `showHeaderActions="{{false}}"` |
| 菜单 | `components/cell` + `constants/mine-menu.js` |
| 文案/待办 | `constants/mine-hub.js` |
| H5 | `utils/tool-entry-context.js` · `constants/h5-links.js` |

## 禁止清单

- App 内 `wx.scanCode` 主按钮（深链扫码逻辑保留）
- 横向 `scroll-x` 小图 rail
- 整行 success/info/warning 底色的 grid tile
- 底部 help/support/merchant 三圆图标栏（与 Nav Cell 重复）
- 首屏「累计收益（元）—」占位
- 无待办时的 status pills / 「暂无待处理」

## 输出格式（改造任务）

```markdown
## 变更摘要
…

## 文件清单
- …

## 用户态自检
- [ ] 未登录 …
- [ ] 已登录无相册 …
- [ ] 已登录有相册 …

## 合规
- [ ] 分享链无收益诱导
- [ ] 已登录无 H5
```

## 关联 Skill

- 完成后：`skill_design_system_check.md`
- 接 summary API：`skill_api_integration.md`
- 样式：`skill_wxss_refactor.md`
