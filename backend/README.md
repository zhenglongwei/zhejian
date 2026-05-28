# 辙见平台 · 后端 API

主业务 API（V2.0 Phase 1），对齐 `docs/10_技术架构与接口/04_接口规范.md` 与服务相册/咨询线索 PRD。

## 技术栈

- Node.js 20 + Express
- **MySQL 8** + Prisma
- 部署：`geo.simplewin.cn`（Nginx 反代）

## 本地开发

```bash
cd backend
cp .env.example .env
docker compose up -d
npm install
npm run db:setup
npm run dev
```

健康检查：<http://127.0.0.1:3000/api/v1/health>

## 鉴权（B-AUTH）

### 用户端 · 微信登录

1. 小程序 `wx.login` → `code`
2. `POST /api/v1/user/auth/wechat-login` `{ code }`
3. 后端 `code2session` → 按 `openid` 查找/创建用户 → 返回 **JWT**

### 用户端 · 绑定手机号

1. 按钮 `open-type="getPhoneNumber"` → `detail.code`
2. `POST /api/v1/user/auth/bind-phone` `{ code }`（须带用户 JWT）
3. 后端调用微信 `getuserphonenumber` 写入手机号

### 环境变量

| 变量 | 说明 |
|---|---|
| `JWT_SECRET` | JWT 签名密钥（真机登录必填） |
| `WECHAT_APP_ID` | 小程序 AppID |
| `WECHAT_APP_SECRET` | 小程序 AppSecret（[微信公众平台](https://mp.weixin.qq.com) → 开发管理 → 开发设置） |
| `DEV_AUTH_ENABLED` | `true` 时保留 dev 固定 token；无 `code` 时可走演示登录 |
| `MERCHANT_AUTO_APPROVE` | `true`（默认）提交入驻后自动通过；运营审核就绪后设为 `false` |

### 商家入驻

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/merchant/onboarding` | 查询当前用户入驻进度（无记录返回 `null`） |
| PUT | `/api/v1/merchant/onboarding/draft` | 保存草稿 |
| POST | `/api/v1/merchant/onboarding/submit` | 提交审核；自动通过时返回 `session`（新 JWT） |
| POST | `/api/v1/merchant/auth/refresh-session` | 审核通过后刷新 JWT 中的 merchant 角色 |

提交体（MVP 与入驻页字段一致）：`storeName`、`contactName`、`phone`、`address`、`services[]`。

### 联调期 dev token

| Header | 用户端 | 商家端 |
|---|---|---|
| `Authorization` | `Bearer dev_user_token_change_me` | `Bearer dev_merchant_token_change_me` |

### 同小程序 · 双角色 JWT

一个微信用户登录后签发 **同一份 JWT**，可同时携带：

| 字段 | 说明 |
|---|---|
| `sub` | 用户 ID |
| `roles` | `['user']` 或 `['user','merchant']` |
| `merchantId` | 入驻审核通过且存在 `merchant_staff` 时有值 |
| `storeId` | 默认门店 |

- 用户 API：`requireAuth(['user'])`
- 商家 API：`requireAuth(['merchant'])` — 同一 token，须 `roles` 含 `merchant` 且 `merchantId` 非空
- 入驻审核通过后：`POST /api/v1/merchant/auth/refresh-session` 刷新 token

**数据隔离**仍按资源归属：用户只能看自己的相册/线索；商家只能操作本店数据（与角色模型无关）。

### 生产部署 checklist

```bash
# backend/.env
JWT_SECRET=<强随机串>
WECHAT_APP_ID=wx54cc6c18cc01b815
WECHAT_APP_SECRET=<从公众平台复制>
DEV_AUTH_ENABLED=false   # 上线后关闭 dev 桩

npm run db:migrate
pm2 restart zhejian-api
```

## 开发鉴权（联调期）

| Header | 用户端 | 商家端 |
|---|---|---|
| `Authorization` | `Bearer dev_user_token_change_me` | `Bearer dev_merchant_token_change_me` |
| `X-Client-Type` | `weapp_user` / `user-miniapp` | `merchant` |

**同小程序联调**：用户端登录后拿到的 `dev_user_token_change_me` 也可访问 `/api/v1/merchant/*`（映射 seed 中的 `merchant_demo_1`），无需单独换商家 token。

演示数据（seed）：

- 用户：`user_demo_1`，手机 `13812345678`
- 服务相册：`alb_svc_demo_completed`
- 咨询线索：`lead_demo_submitted`、`lead_demo_contacted`
- 遗留订单相册（仅 seed，API 已 410）：`ord_demo_completed_album`

## 已实现的 API（v1 · V2.0）

### 咨询线索

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/user/auth/wechat-login` | 微信登录（联调期返回 dev token） |
| POST | `/api/v1/user/auth/bind-phone` | 绑定手机号（联调期演示） |
| POST | `/api/v1/user/auth/logout` | 退出登录 |
| GET | `/api/v1/user/mine/summary` | 我的页摘要 |
| GET | `/api/v1/user/leads/confirm` | 咨询确认页数据 |
| GET | `/api/v1/user/leads` | 用户咨询列表 |
| POST | `/api/v1/user/leads` | 提交咨询 |
| GET | `/api/v1/user/leads/:leadId` | 咨询详情 |
| POST | `/api/v1/user/leads/:leadId/cancel` | 取消咨询 |
| GET | `/api/v1/merchant/leads` | 商家线索列表 |
| GET | `/api/v1/merchant/leads/stats` | 线索统计 |
| GET | `/api/v1/merchant/leads/:leadId` | 线索详情 |
| POST | `/api/v1/merchant/leads/:leadId/view` | 标记已查看 |
| POST | `/api/v1/merchant/leads/:leadId/contact` | 标记已联系 |
| POST | `/api/v1/merchant/leads/:leadId/close` | 关闭线索 |

### 服务相册

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/user/service-albums` | 用户相册列表 |
| GET | `/api/v1/user/service-albums/:albumId` | 用户相册详情 |
| POST | `/api/v1/user/albums/:albumId/authorize-preview` | 授权脱敏预览 |
| POST | `/api/v1/user/service-albums/:albumId/authorization` | 用户授权公开 |
| POST | `/api/v1/user/service-albums/:albumId/public-case` | 提交公开案例 |
| GET | `/api/v1/user/service-albums/authorizations` | 授权记录 |
| POST | `/api/v1/user/service-albums/:albumId/withdraw-authorization` | 撤回授权 |
| GET | `/api/v1/merchant/service-albums` | 商家相册列表 |
| POST | `/api/v1/merchant/service-albums` | 创建留档 |
| GET | `/api/v1/merchant/service-albums/:albumId` | 商家相册详情 |
| POST | `/api/v1/merchant/service-albums/:albumId` | 保存留档 |
| POST | `/api/v1/merchant/service-albums/:albumId/complete` | 完工 + pre-mask |

### 媒体上传（B-MEDIA）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/media/upload` | 小程序 `wx.uploadFile`，字段名 `file`；需登录（user/merchant） |
| GET | `/media/uploads/{yyyy}/{mm}/{filename}` | 静态访问已上传图片（Nginx 反代至 Node） |

存储目录默认 `backend/data/media`（`MEDIA_STORAGE_DIR` 可改）。生产部署须同步 Nginx `location /media/`（见 `deploy/nginx-geo.simplewin.cn.conf`）。

### 脱敏 / 系统

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/desensitize/tasks/:taskId` | 脱敏任务详情 |
| POST | `/api/v1/desensitize/tasks/:taskId/auto-mask` | 一键脱敏 |
| POST | `/api/v1/desensitize/tasks/:taskId/confirm` | 确认脱敏任务 |
| POST | `/api/v1/system/albums/:albumId/pre-mask` | 系统触发 pre-mask |

### 已冻结（410）

| 方法 | 路径 |
|---|---|
| GET | `/api/v1/user/orders/:orderId/album` |
| POST | `/api/v1/user/orders/:orderId/album/authorize-preview` |

## 小程序联调

`services/config.js`：`mode: 'dev'`，`baseUrl: 'https://geo.simplewin.cn'`（或本地 `http://127.0.0.1:3000`，**不要**带 `/api/v1`）

## 目录结构

```
backend/
├── prisma/          # schema、migrations、seed
├── src/
│   ├── routes/      # HTTP 路由
│   ├── services/    # 业务逻辑
│   └── middleware/  # 鉴权、错误处理
```
