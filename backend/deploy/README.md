# 阿里云部署指南（B-INF）

目标：**geo.simplewin.cn** 提供 `/api/v1/`（Node）、`/admin/`、`/case/` 静态 H5。

| 路径 | 说明 |
| --- | --- |
| `/api/v1/` | 本 backend（**PM2** `zhejian-api` 或 systemd，见下） |
| `/admin/` | `admin-web/dist/`（须先 `cd admin-web && npm run build`） |
| `/case/` | `h5/case/` |

**完整步骤**：`docs/12_测试验收部署与安全合规/B-INF_生产与真机联调.md`  
**用户向**：`docs/部署上手指南.md`

## 快速命令

```bash
cd /var/www/zhejian
sudo bash scripts/server-install.sh --init
# 编辑 backend/.env 后：
sudo bash scripts/server-install.sh
curl -s https://geo.simplewin.cn/api/v1/health
```

## PM2（推荐，与现有运维习惯一致）

与 **simplewin.cn :3000** 共存时，`backend/.env` 设 **`PORT=3100`**，Nginx geo 块 `/api/` 反代到 `127.0.0.1:3100`。

```bash
cd /var/www/zhejian/backend
cp .env.production.example .env   # 首次
nano .env                         # DATABASE_URL、DEV_*_TOKEN、PORT=3100

npm install
npm run sync:shared-utils   # 同步相册检查等 shared utils 到 backend/vendor（必跑）
npm run db:setup:prod

# 若曾用 systemd，先停掉避免抢端口
sudo systemctl stop zhejian-api 2>/dev/null || true
sudo systemctl disable zhejian-api 2>/dev/null || true

pm2 start ecosystem.config.cjs
pm2 restart zhejian-api
pm2 logs zhejian-api --lines 30   # 应见 inspLlm enabled=true
curl -s http://127.0.0.1:3100/api/v1/health

pm2 save
pm2 startup                      # 按提示执行一条 sudo 命令，开机自启
```

## 小程序

`services/config.js` → `ACTIVE_ENV = 'prod'`

## Nginx 更新（AI 检查超时）

生产真源：**`backend/deploy/simplewin.conf`**（与 `/etc/nginx/conf.d/simplewin.conf` 同步）。

本次变更：`geo.simplewin.cn` 的 `location /api/` 增加 `proxy_send_timeout` / `proxy_read_timeout` **240s**（原 60s 会导致 AI 检查中途断开）。

```bash
# 服务器上（git pull 后）
sudo cp /var/www/zhejian/backend/deploy/simplewin.conf /etc/nginx/conf.d/simplewin.conf
sudo nginx -t && sudo systemctl reload nginx
```

若只改 `/api/` 片段、不覆盖整文件，见 `backend/deploy/nginx-api-location.snippet.conf`。

独立 geo 模板（含 `__SSL_*__` 占位符）：`backend/deploy/nginx-geo.simplewin.cn.conf`。

## 验证脚本

```bash
cd backend
npm run deploy:verify -- https://geo.simplewin.cn
```

## 安全清单

- [ ] 修改 `DEV_*_TOKEN` 默认值
- [ ] MySQL 仅 127.0.0.1
- [ ] 防火墙 80/443/22
- [ ] 定期备份 `zhejian` 库
- [ ] 真实微信登录上线后 `DEV_AUTH_ENABLED=false`
