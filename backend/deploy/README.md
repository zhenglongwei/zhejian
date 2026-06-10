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
npm run db:setup:prod

# 若曾用 systemd，先停掉避免抢端口
sudo systemctl stop zhejian-api 2>/dev/null || true
sudo systemctl disable zhejian-api 2>/dev/null || true

pm2 start ecosystem.config.cjs
pm2 restart zhejian-api          # 以后改代码/配置后
curl -s http://127.0.0.1:3100/api/v1/health

pm2 save
pm2 startup                      # 按提示执行一条 sudo 命令，开机自启
```

## 小程序

`services/config.js` → `ACTIVE_ENV = 'prod'`

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
