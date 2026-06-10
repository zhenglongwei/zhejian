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
3. 生产须配置 **`JWT_SECRET`**（与小程序登录共用）；登录成功后返回 **JWT system token**，不依赖 `DEV_AUTH_ENABLED`。
4. 若仅本地联调且无 `JWT_SECRET`，可设 `DEV_AUTH_ENABLED=true` 使用 dev admin token。

请求头：`Authorization: Bearer <token>`、`X-Client-Type: admin`。

## 构建部署

```bash
cd admin-web
npm install
npm run build
```

构建产物在 `admin-web/dist/`。Nginx 已配置读该目录（见 `backend/deploy/simplewin.conf`）。

**ECS 发版**（在服务器 `/var/www/zhejian` 拉代码后）：

```bash
cd admin-web && npm ci && npm run build
sudo cp /var/www/zhejian/backend/deploy/simplewin.conf /etc/nginx/conf.d/simplewin.conf
sudo nginx -t && sudo systemctl reload nginx
```

浏览器打开：`https://geo.simplewin.cn/admin/` → 登录页。

## OPS-MASK-01 页面

| 路由 | 说明 |
| --- | --- |
| `/admin/login` | 运营登录 |
| `/admin/cases` | 公开案例审核列表 |
| `/admin/cases/:caseId` | 审核详情（**脱敏图** + OCR 摘要 + 审核操作；**不展示原图**） |
| `/admin/merchants` | 商家入驻审核列表 |
| `/admin/merchants/:merchantId` | 商家入驻审核详情 |
| `/admin/services` | 服务方案事后监管 |
| `/admin/services/:planId` | 抽查 / 下架 / 限预约 |
| `/admin/reports` | 举报工单列表 |
| `/admin/reports/:reportId` | 举报处置 |

案例详情另含：公众号文章导出、FAQ 外链编辑（**A-PUB-07**）。

## 关联任务

- **OPS-MASK-01**：案例审核模块
- **B-MERCH-04**：商家入驻审核模块
- **A-PUB-06**：用户提交公开案例 → `pending_review`，运营通过后 `public_approved`
- **B-MASK-04**：详情读 `privacy_detection_result` / pre-mask 任务
