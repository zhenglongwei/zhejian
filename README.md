# 辙见

**盈简科技**旗下产品；仓库代号 `zhejian`（文档中「辙见」同指本项目）。

微信小程序（用户端 + 商家分包）+ 后端 API + H5 公开页 monorepo。  
对外域名：**geo.simplewin.cn**（API / SEO·GEO / 运营后台）；公司官网 **simplewin.cn** 独立部署。

## 域名与路径

| 域名 / 路径 | 用途 |
|---|---|
| `simplewin.cn` | 盈简科技官网（不在本仓库） |
| `geo.simplewin.cn/api/v1/` | 小程序与后台 API |
| `geo.simplewin.cn/admin/` | 运营后台 Web（规划中） |
| `geo.simplewin.cn/` | H5 公开案例 / SEO·GEO |

详见 [docs/10_技术架构与接口/10_域名与部署架构.md](docs/10_技术架构与接口/10_域名与部署架构.md)。

## 目录

| 路径 | 说明 |
|---|---|
| `pages/`、`components/` | 用户端小程序 |
| `packageMerchant/` | 商家端分包 |
| `services/` | 前端 API 封装（mock / 真实切换） |
| `backend/` | Node.js API + MySQL |
| `h5/` | H5 公开页静态资源 |
| `docs/` | PRD 与设计规范 |

## 部署（必读）

**本地 + 云端 + GitHub 一步步说明：** [docs/部署上手指南.md](docs/部署上手指南.md)

- 本地：已写好 `backend/.env`，运行 `scripts/local-setup.ps1`
- 云端：`git clone` 到 `/var/www/zhejian`，**目录与 GitHub / 本地一致**；Nginx 把 URL 映射到仓库内子目录

## 快速开始

### 小程序（mock）

微信开发者工具打开本项目根目录即可，`services/config.js` 默认 `mode: 'mock'`。

### 后端 API（本地）

```bash
cd backend
cp .env.example .env
docker compose up -d   # 可选：本地无 MySQL 时
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

- 域名架构：`docs/10_技术架构与接口/10_域名与部署架构.md`
- 设计体系：`docs/00_设计规范/`
- 接口规范：`docs/10_技术架构与接口/04_接口规范.md`
- 后端说明：`backend/README.md`
