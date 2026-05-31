# admin-web（运营后台）

> 部署路径：`https://geo.simplewin.cn/admin/` · API：`/api/v1/`

## 本地开发

```bash
cd admin-web
npm install
npm run dev
```

浏览器打开：`http://127.0.0.1:5174/admin/`（Vite 已代理 `/api` → `http://127.0.0.1:3000`）。

## 登录

1. 启动 backend（`backend` 目录 `npm run dev`）。
2. 在 `backend/.env` 配置 `ADMIN_PASSWORD`（默认 `admin_change_me`）。
3. 登录成功后使用返回的 `admin_token`（联调期等同 `DEV_SYSTEM_TOKEN` / `DEV_ADMIN_TOKEN`）。

请求头：`Authorization: Bearer <token>`、`X-Client-Type: admin`。

## 构建部署

```bash
npm run build
```

将 `dist/` 同步至服务器 `/var/www/geo.simplewin.cn/admin/`。

## OPS-MASK-01 页面

| 路由 | 说明 |
| --- | --- |
| `/admin/login` | 运营登录 |
| `/admin/cases` | 公开案例审核列表 |
| `/admin/cases/:caseId` | 审核详情（原图/脱敏对比 + OCR 摘要 + 审核操作） |

## 关联任务

- **OPS-MASK-01**：本模块
- **A-PUB-06**：用户提交公开案例 → `pending_review`，运营通过后 `public_approved`
- **B-MASK-04**：详情读 `privacy_detection_result` / pre-mask 任务
