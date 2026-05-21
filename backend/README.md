# 透明维修平台 · 后端 API

主业务 API（MVP），对齐 `docs/10_技术架构与接口/04_接口规范.md` 与订单相册/脱敏 PRD。

## 技术栈

- Node.js 20 + Express
- **MySQL 8** + Prisma（与阿里云服务器现有 MySQL 一致）
- 部署：`geo.simplewin.cn`（Nginx 反代）

## 本地开发

若本机没有 MySQL，可用 `docker compose up -d` 起一个临时库；**生产环境直接用服务器已有 MySQL**，不必再装 PostgreSQL。

```bash
cd backend
cp .env.example .env
docker compose up -d
npm install
npm run db:setup
npm run dev
```

健康检查：<http://127.0.0.1:3000/api/v1/health>

## 开发鉴权（联调期）

`.env` 中固定 token（生产务必更换并接入微信登录 JWT）：

| Header | 值 |
|---|---|
| `Authorization` | `Bearer dev_user_token_change_me` |
| `X-Client-Type` | `weapp_user` |

演示订单：`ord_demo_completed_album`（seed 写入）

## 已实现的 API（v1）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/health` | 健康检查 |
| GET | `/api/v1/user/orders/:orderId/album` | 用户订单相册 |
| POST | `/api/v1/user/orders/:orderId/album/authorize-preview` | 授权预览（策略 B） |
| POST | `/api/v1/user/albums/:albumId/authorization` | 用户授权公开 |
| GET | `/api/v1/desensitize/tasks/:taskId` | 脱敏任务详情 |
| POST | `/api/v1/desensitize/tasks/:taskId/auto-mask` | 一键脱敏 |
| POST | `/api/v1/desensitize/tasks/:taskId/assets/:assetId/retry` | 单张重试 |
| POST | `/api/v1/desensitize/tasks/:taskId/assets/:assetId/previewed` | 标记已预览 |
| POST | `/api/v1/desensitize/tasks/:taskId/confirm` | 确认脱敏任务 |
| POST | `/api/v1/merchant/albums/:albumId/complete` | 商家完工 + 触发 pre-mask |
| POST | `/api/v1/system/albums/:albumId/pre-mask` | 系统触发 pre-mask |

## 阿里云部署（8.155.0.128 / geo.simplewin.cn）

详见 [deploy/README.md](./deploy/README.md)。

简要步骤：

1. 服务器安装 Docker、Node 20、Nginx
2. `git clone` 本仓库，`cd backend`
3. 配置 `.env`（`DATABASE_URL` 指向服务器 MySQL、`PUBLIC_BASE_URL=https://geo.simplewin.cn`）
4. `npm run db:setup && npm start`（生产一般不需要 docker compose）
5. Nginx 将 `/api/` 反代到 `127.0.0.1:3000`
6. 小程序 `services/config.js`：`mode: 'dev'`，`baseUrl: 'https://geo.simplewin.cn'`

## 脱敏引擎说明

当前为 **占位引擎**：将原图 URL 映射为 `{PUBLIC_BASE_URL}/media/desensitized/...`。  
后续可替换为阿里云 OSS + 真实 OCR/打码服务，业务 API 契约不变。

## 目录结构

```
backend/
├── prisma/          # schema、migrations、seed
├── src/
│   ├── routes/      # HTTP 路由
│   ├── services/    # 业务逻辑
│   └── middleware/  # 鉴权、错误处理
└── deploy/          # Nginx、systemd 示例
```
