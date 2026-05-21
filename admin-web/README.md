# admin-web（运营后台）

> **状态：规划中** · 部署路径 `https://geo.simplewin.cn/admin/`

盈简科技 · **辙见** 平台运营后台：案例审核、订单管理、内容管理等（见 `docs/06_平台运营后台/`）。

## 部署约定

| 项 | 值 |
|---|---|
| 访问 URL | `https://geo.simplewin.cn/admin/` |
| API | 同域 `https://geo.simplewin.cn/api/v1/` |
| 构建 base | `/admin/`（Vite: `base: '/admin/'`；Vue Router: `history` + `base`） |
| Nginx 静态目录 | `/var/www/geo.simplewin.cn/admin/` |

## 技术建议

见 `docs/10_技术架构与接口/02_前端架构.md`：Vue Admin 或 React Admin + Element Plus / Ant Design。

## 鉴权

联调期可与 API 共用 `DEV_*_TOKEN`；正式环境使用 `admin_token`（见 `04_接口规范.md` §8.1）。
