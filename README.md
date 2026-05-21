# 透明维修服务平台（浙检）

微信小程序用户端 + 商家分包 + 后端 API  monorepo。

## 目录

| 路径 | 说明 |
|---|---|
| `pages/`、`components/` | 用户端小程序 |
| `packageMerchant/` | 商家端分包 |
| `services/` | 前端 API 封装（mock / 真实切换） |
| `backend/` | Node.js API + PostgreSQL |
| `docs/` | PRD 与设计规范 |
| `h5/` | H5 公开页静态资源 |

## 快速开始

### 小程序（mock）

微信开发者工具打开本项目根目录即可，`services/config.js` 默认 `mode: 'mock'`。

### 后端 API（本地）

```bash
cd backend
cp .env.example .env
docker compose up -d
npm install
npm run db:setup
npm run dev
```

### 联调 geo.simplewin.cn

1. 按 `backend/deploy/README.md` 部署到阿里云
2. `services/config.js` → `mode: 'dev'`
3. 微信公众平台配置 request 合法域名 `https://geo.simplewin.cn`
4. 联调 token 与 `backend/.env` 中 `DEV_USER_TOKEN` 一致

## 文档

- 设计体系：`docs/00_设计规范/`
- 接口规范：`docs/10_技术架构与接口/04_接口规范.md`
- 后端说明：`backend/README.md`
