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

部署后**必跑**（只读，不输出密钥）：

```bash
cd backend
npm run check:prod-env
# 远程探测 dev 鉴权 / 默认密码是否仍可用
npm run check:prod-env -- --probe https://geo.simplewin.cn
```

- [ ] `npm run check:prod-env` 无 CRIT
- [ ] `DEV_AUTH_ENABLED=false`（生产）
- [ ] `JWT_SECRET` / `ADMIN_PASSWORD` 为强随机串（非默认值）
- [ ] `MERCHANT_AUTO_APPROVE=false`
- [ ] 未设置 `WECHAT_PAY_SUBSCRIPTION_TEST_AMOUNT_CENTS`
- [ ] `CRAWLER_INGEST_TOKEN` 已设置
- [ ] Phase 2：`MEDIA_SIGNED_URLS` 核查通过（`check:prod-env` 无 HIGH）
- [ ] Phase 2：`CORS_ALLOWED_ORIGINS` 已确认（或接受默认白名单）
- [ ] MySQL 仅 127.0.0.1
- [ ] 防火墙 80/443/22
- [ ] 定期备份 `zhejian` 库

## GEO 二期上线清单（2026-07-13）

> 代码合并后，在服务器 `backend/` 依次执行；运营动作在 admin-web 完成。

### 1. 拉代码与构建

```bash
cd /var/www/zhejian
git pull
cd backend && npm install && npm run sync:shared-utils && npm run db:migrate
cd ../admin-web && npm install && npm run build
pm2 restart zhejian-api
```

### 2. 存量数据回填（首次或案例/专题有增量时）

```bash
cd /var/www/zhejian/backend

# 卷九前案例补 snapshot（trustMeta 前置）
npm run case:snapshot-legacy-backfill

# trustMeta 写入 enrichment
npm run case:trust-meta-backfill

# 100 条种子专题入库（默认 draft 模式，不降级已发布）
npm run geo:batch-draft

# 覆盖率只计「已发布」；新种子默认为 draft，生产须发布：
npm run geo:batch-draft:publish
npm run geo:aggregate-refresh

# OBS 词库同步
npm run geo:probe-seed-sync

# 诊断缺口：npm run geo:production-status
# 一键收口：npm run geo:production-bootstrap
```

生产首次推荐一键：

```bash
npm run geo:production-bootstrap
```

若仅验收环境、不发布：

```bash
npm run geo:production-bootstrap -- --skip-publish
```

旧式分步（等价于 bootstrap）：

```bash
npm run geo:batch-draft:publish
```

### 3. 冒烟验收（服务器本机）

```bash
npm run test:geo-topic-seed
npm run test:geo-batch-draft
npm run geo:batch-draft-smoke
npm run geo:prompt-coverage-smoke
npm run geo:topic-scale-smoke
npm run geo:robots-audit-smoke
npm run geo:aggregate-refresh-smoke
npm run public:feed-parity-smoke
npm run deploy:verify -- https://geo.simplewin.cn
```

### 4. `.env` GEO 相关（生产必查）

```bash
PUBLIC_BASE_URL=https://geo.simplewin.cn
GEO_PROBE_ENABLED=true          # 要跑 Citation Gap 时
GEO_PROBE_DRY_RUN=false
GEO_PROBE_ENGINES=qwen,doubao   # 按实际有 Key 的引擎
DASHSCOPE_API_KEY=sk-xxx        # 或对应引擎 Key
DEV_AUTH_ENABLED=false
```

### 5. 定时任务（crontab）

| 任务 | 脚本 | 建议时间 |
| --- | --- | --- |
| 专题聚合重算 | `geo-aggregate-refresh-cron.sh` | 每天 02:00 |
| OBS 词库探测 | `geo-prompt-probe-cron.sh` | 每周一 03:00 |
| 商家看板日聚合 | `stats-aggregate-cron.sh` | 每天 00:00 |

详见 [`docs/部署上手指南.md`](../../docs/部署上手指南.md) §7。

### 6. 运营台动作

1. 登录 `https://geo.simplewin.cn/admin/` → **GEO 探测**
2. **同步词库** → **批量生成草稿**（刷新 100 条专题内容，不降级已发布）
3. 在 **专题健康度** 看板检查告警项
4. 逐条或批量合规后，在专题编辑页走 **H06 发布闸门** 发布

完整步骤亦见 [`docs/12_测试验收部署与安全合规/B-INF_生产与真机联调.md`](../../docs/12_测试验收部署与安全合规/B-INF_生产与真机联调.md)。
