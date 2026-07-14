# 预发环境搭建（staging.geo.simplewin.cn）

> 与生产同机隔离：代码目录、MariaDB 库、API 端口、上传文件、运营后台均独立。  
> 生产目录 `/var/www/zhejian` **不要**在本流程中 `git pull` 到未验收的代码。

关联：

- 域名架构：`docs/10_技术架构与接口/10_域名与部署架构.md`
- 生产联调：`docs/12_测试验收部署与安全合规/B-INF_生产与真机联调.md`
- 部署上手：`docs/部署上手指南.md` §预发
- Nginx 模板：`backend/deploy/nginx-staging.geo.simplewin.cn.conf`
- 环境变量模板：`backend/.env.staging.example`

---

## 0. 对照表

| 项 | 预发 | 生产 |
| --- | --- | --- |
| 目录 | `/var/www/zhejian-staging` | `/var/www/zhejian` |
| 域名 | `https://staging.geo.simplewin.cn` | `https://geo.simplewin.cn` |
| API 端口 | `3101` | `3100` |
| PM2 名 | `zhejian-api-staging` | `zhejian-api` |
| 数据库 | `zhejian_staging`（MariaDB） | `zhejian` |
| 后台 | `/admin/` | `/admin/` |
| 小程序 | `ACTIVE_ENV = 'staging'` | `ACTIVE_ENV = 'prod'` |

数据库引擎为 **MariaDB 10.5**（连接串仍用 `mysql://…`，与 Prisma 一致）。

---

## 1. 前置检查

1. DNS：`staging.geo.simplewin.cn` 已解析到本机公网 IP（与 `geo.simplewin.cn` 同机）。
2. 生产 `/var/www/zhejian` 与 `zhejian-api` 正常运行，本流程不改生产 `.env`。
3. 微信公众平台 → 开发 → 开发管理 → 服务器域名 → **request 合法域名** 增加：  
   `https://staging.geo.simplewin.cn`  
   （保存后约几分钟生效；体验版测预发时关闭「不校验合法域名」。）

---

## 2. 代码目录

在服务器执行（二选一）：

**A. 独立 clone（推荐）**

```bash
sudo mkdir -p /var/www
# 与生产使用同一仓库地址；目录名必须是 zhejian-staging
sudo git clone https://github.com/你的用户名/zhejian.git /var/www/zhejian-staging
sudo chown -R $USER:$USER /var/www/zhejian-staging
cd /var/www/zhejian-staging
git checkout main   # 或预发要用的分支
```

**B. 从生产目录复制源码（无 git remote 时）**

```bash
sudo rsync -a --exclude node_modules --exclude backend/.env --exclude backend/data \
  /var/www/zhejian/ /var/www/zhejian-staging/
sudo chown -R $USER:$USER /var/www/zhejian-staging
```

确认预发目录里**没有**生产 `backend/.env`（若误拷，立刻删除后按 §4 重建）。

---

## 3. MariaDB：新建预发库

用 root 或有建库权限的账号登录：

```bash
sudo mysql -u root -p
```

```sql
CREATE DATABASE IF NOT EXISTS zhejian_staging
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 建议独立用户（密码请换成强随机串；若含 @ # 等，写入 DATABASE_URL 时要 URL 编码）
CREATE USER IF NOT EXISTS 'zhejian_staging'@'127.0.0.1' IDENTIFIED BY '请改成强密码';
GRANT ALL PRIVILEGES ON zhejian_staging.* TO 'zhejian_staging'@'127.0.0.1';
FLUSH PRIVILEGES;
```

若 MariaDB 版本不支持 `CREATE USER IF NOT EXISTS`，改为：

```sql
CREATE USER 'zhejian_staging'@'127.0.0.1' IDENTIFIED BY '请改成强密码';
```

验证：

```bash
mysql -u zhejian_staging -p -h 127.0.0.1 -e "SHOW DATABASES LIKE 'zhejian_staging';"
```

第一期用**空库 + 迁移**即可；不要直接把生产库拷过去（含隐私数据）。

---

## 4. 预发 `.env`

```bash
cd /var/www/zhejian-staging/backend
cp .env.staging.example .env
nano .env
```

必改项：

| 变量 | 值 |
| --- | --- |
| `PORT` | `3101` |
| `PUBLIC_BASE_URL` | `https://staging.geo.simplewin.cn` |
| `DATABASE_URL` | `mysql://zhejian_staging:密码@127.0.0.1:3306/zhejian_staging` |
| `JWT_SECRET` | **与生产不同**的随机串 |
| `ADMIN_PASSWORD` | **与生产不同** |
| `CRAWLER_INGEST_TOKEN` | 随机串 |
| `DEV_AUTH_ENABLED` | `false`（除非临时联调） |

可选：脱敏/百炼等 Key 可与生产共用（注意额度）；支付回调若测，须指向预发域名且商户配置隔离。

---

## 5. 依赖、建表、构建后台

```bash
cd /var/www/zhejian-staging/backend
npm install
npm run sync:shared-utils
npm run db:setup:prod
# 若无 setup:prod，等价于：npx prisma migrate deploy（及项目约定的 seed/同步步骤）
mkdir -p logs data/media

cd /var/www/zhejian-staging/admin-web
npm install
npm run build
```

---

## 6. PM2 启动预发 API

```bash
cd /var/www/zhejian-staging/backend
pm2 start ecosystem.staging.config.cjs
pm2 logs zhejian-api-staging --lines 40
curl -s http://127.0.0.1:3101/api/v1/health
pm2 save
```

应看到 health `ok`；进程名必须是 `zhejian-api-staging`，勿 `restart zhejian-api`（那是生产）。

---

## 7. HTTPS 证书 + Nginx

### 7.1 证书

DNS 生效后：

```bash
sudo certbot certonly --nginx -d staging.geo.simplewin.cn
```

证书路径应为：

- `/etc/letsencrypt/live/staging.geo.simplewin.cn/fullchain.pem`
- `/etc/letsencrypt/live/staging.geo.simplewin.cn/privkey.pem`

若暂时没有证书：可先注释 Nginx 里 `listen 443` 整块，仅保留 80→301，或临时用 HTTP 调试（小程序正式域名要求 HTTPS，最终必须上证书）。

### 7.2 安装站点配置

```bash
sudo cp /var/www/zhejian-staging/backend/deploy/nginx-staging.geo.simplewin.cn.conf \
  /etc/nginx/conf.d/staging.geo.simplewin.cn.conf
sudo nginx -t && sudo systemctl reload nginx
```

**不要**把预发 server 块合并进生产用的 `simplewin.conf` 后整文件覆盖，以免误改生产路径。

### 7.3 冒烟

```bash
curl -s https://staging.geo.simplewin.cn/api/v1/health
curl -sI https://staging.geo.simplewin.cn/admin/
cd /var/www/zhejian-staging/backend
npm run deploy:verify -- https://staging.geo.simplewin.cn
```

浏览器打开：`https://staging.geo.simplewin.cn/admin/`（用预发 `ADMIN_PASSWORD` 登录）。

---

## 8. 小程序接预发

本地仓库（或上传体验版前）：

```javascript
// services/config.js
const ACTIVE_ENV = 'staging'
```

1. 微信后台已加 request 合法域名 `https://staging.geo.simplewin.cn`
2. 体验版 / 真机预览：**关闭**「不校验合法域名」
3. 编译上传体验版，验证登录、列表、相册等核心路径
4. **提审 / 正式发版前**必须改回 `ACTIVE_ENV = 'prod'`，再上传

用户端与商家端分包共用同一份 `services/config.js`。

---

## 9. 日常：先预发，再生产

### 9.1 更新预发

```bash
cd /var/www/zhejian-staging
git pull
cd backend && npm install && npm run sync:shared-utils && npm run db:migrate
cd ../admin-web && npm install && npm run build
pm2 restart zhejian-api-staging
curl -s https://staging.geo.simplewin.cn/api/v1/health
```

验收：H5、后台、小程序体验版（staging）。

### 9.2 再更新生产（验收通过后）

```bash
cd /var/www/zhejian
git pull   # 使用与预发相同的 commit / tag
cd backend && npm install && npm run sync:shared-utils && npm run db:migrate
cd ../admin-web && npm install && npm run build
pm2 restart zhejian-api
curl -s https://geo.simplewin.cn/api/v1/health
```

生产 Nginx 若有变更，仍按生产文档同步 `simplewin.conf`；预发只动 `staging.geo.simplewin.cn.conf`。

---

## 10. 注意与禁止

1. **禁止**预发与生产共用同一个 MariaDB 库。
2. **禁止**预发 `MEDIA_STORAGE_DIR` 指向生产 `data/media`。
3. **禁止**正式版小程序带着 `ACTIVE_ENV = 'staging'` 提审。
4. 预发 crontab（统计/GEO 聚合）默认**不要**照抄生产；需要时再单独加，并写清路径为 `zhejian-staging`。
5. 预发可被搜索引擎抓取时，可在预发 `robots.txt` 策略或 Nginx 层限制（按需）；勿把测试脏数据当生产 SEO。

---

## 11. 回滚预发（不影响生产）

```bash
cd /var/www/zhejian-staging
git fetch && git checkout <已知良好的 tag 或 commit>
cd backend && npm install && npm run sync:shared-utils && npm run db:migrate
cd ../admin-web && npm run build
pm2 restart zhejian-api-staging
```

停用预发（临时）：

```bash
pm2 stop zhejian-api-staging
# 可选：sudo rm /etc/nginx/conf.d/staging.geo.simplewin.cn.conf && sudo nginx -t && sudo systemctl reload nginx
```
