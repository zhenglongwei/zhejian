# B-INF · 生产部署与真机联调

> 对应 `docs/00_开发计划.md` **B-INF-01～B-INF-04**  
> **当前生产现状（2026-05-26）**：`https://geo.simplewin.cn/api/v1/health` 返回 Next.js HTML 404，说明 **/api/ 尚未反代到 Node**。完成本文 §二 后应返回 JSON `"db":"up"`。

---

## 一、任务清单

| ID | 任务 | 负责方 | 验收 |
| --- | --- | --- | --- |
| B-INF-01 | 服务器部署 backend + MySQL | 运维/开发 SSH | `systemctl status zhejian-api` active |
| B-INF-02 | Nginx HTTPS + `/api/` 反代 | 运维 | `curl https://geo.simplewin.cn/api/v1/health` 为 JSON |
| B-INF-03 | 微信小程序 request 合法域名 | 小程序管理员 | 真机 request 不报域名非法 |
| B-INF-04 | migrate + 可选 seed + health 脚本 | 开发/运维 | `npm run deploy:verify` 通过 |

---

## 二、服务器部署（B-INF-01 + B-INF-02 + B-INF-04）

### 2.1 前置

- 代码已在 `/var/www/zhejian`（`git clone` 或上传，见 `docs/部署上手指南.md`）
- MySQL 已建库 `zhejian` 与用户 `zhejian@127.0.0.1`
- SSL 证书：部署脚本会**自动从现有 Nginx 配置**或 `backend/.env` 的 `SSL_CERTIFICATE*` 读取；若均不存在见 §2.6

### 2.2 一键脚本（Alibaba Cloud Linux / CentOS / Ubuntu 均适用）

```bash
cd /var/www/zhejian
git pull                                      # 务必先更新（旧脚本含 apt-get 会报错）
sudo bash scripts/server-install.sh --init   # 首次：生成 .env
sudo nano backend/.env                        # 改 DATABASE_URL、DEV_USER_TOKEN
sudo bash scripts/server-install.sh           # 安装、migrate、nginx、systemd
```

裸机缺 node/nginx 时（可选）：

```bash
sudo bash scripts/server-install.sh --bootstrap
```

**说明**：Alibaba Cloud Linux 使用 **yum/dnf**，无 `apt-get`；`--init` 不安装系统包，只复制 `.env`。

`.env` 参考 `backend/.env.production.example`。

### 2.3 手动核对

```bash
# 本机 Node
curl -s http://127.0.0.1:3000/api/v1/health

# 外网 HTTPS（B-INF-02）
curl -s https://geo.simplewin.cn/api/v1/health
```

期望 JSON 示例：

```json
{
  "code": 0,
  "data": { "ok": true, "service": "zhejian-api", "db": "up" }
}
```

### 2.4 Nginx 与 Next.js 共存

若域名上已有 **Next.js** 占 `/`，必须在 Nginx 中保证 **`location /api/` 写在 catch-all 之前**，并 `proxy_pass` 到 `127.0.0.1:3000`。  
配置文件：`backend/deploy/nginx-geo.simplewin.cn.conf`；仅合并反代时用 `backend/deploy/nginx-api-location.snippet.conf`。

### 2.5 生产数据库

| 命令 | 用途 |
| --- | --- |
| `npm run db:setup:prod` | 生产：**仅** generate + migrate（不 seed） |
| `npm run db:seed` | 首次演示数据（可选，勿重复跑） |
| `npm run deploy:verify` | 健康检查脚本 |

### 2.7 geo 专域 + 清理旧项目（simplewin.cn 与 geo 分离）

| 域名 | 用途 | 是否改动 |
| --- | --- | --- |
| `simplewin.cn` | 公司官网 | **勿动**（保留 `simplewin.conf` 中官网 server 块） |
| `geo.simplewin.cn` | 辙见 API + H5 | 使用仓库 `nginx-geo.simplewin.cn.conf` 独占 |

若服务器上曾有其它项目占 **3000** 端口，需先停掉旧服务，再部署 `zhejian-api`。

```bash
# 查看占用
sudo bash scripts/redeploy-geo-clean.sh --inspect

# 手动：stop/disable 旧 node/next/pm2 服务；从 simplewin.conf 删除 geo.simplewin.cn 的 server 块

sudo bash scripts/redeploy-geo-clean.sh --deploy
# 等价于：释放 3000 → server-install.sh → 独立 geo Nginx + systemd
```

目标架构：

```text
geo.simplewin.cn
  /api/*     → zhejian-api :3000
  /case/*    → /var/www/zhejian/h5/case/
  /shared/*  → /var/www/zhejian/h5/shared/
  /          → /var/www/zhejian/h5/
```

### 2.6 Nginx SSL 证书找不到（常见）

报错示例：

```text
cannot load certificate "/etc/nginx/ssl/geo.simplewin.cn/fullchain.pem": No such file
```

**原因**：模板默认路径与服务器实际证书位置不一致。域名若已能 HTTPS 打开，说明证书已在某处配置好。

**步骤 1 — 查现有证书路径**（SSH 在服务器）：

```bash
grep -r ssl_certificate /etc/nginx/
```

**步骤 2 — 任选其一**：

| 方式 | 操作 |
| --- | --- |
| A. 写入 `.env` | 在 `backend/.env` 增加 `SSL_CERTIFICATE=` / `SSL_CERTIFICATE_KEY=`（见 `.env.production.example`） |
| B. 符号链接 | `sudo mkdir -p /etc/nginx/ssl/geo.simplewin.cn` 后 `ln -sf` 到实际 pem |
| C. 只合并 API | 已有 Next.js 站点时，编辑原 `server` 块，插入 `backend/deploy/nginx-api-location.snippet.conf`，然后 `sudo bash scripts/server-install.sh --skip-nginx` |

**步骤 3 — 重跑**：

```bash
cd /var/www/zhejian && git pull
sudo bash scripts/server-install.sh
```

**Node 版本**：若 `npm warn EBADENGINE`（当前 Node 18），建议 `sudo bash scripts/server-install.sh --bootstrap` 升级到 Node 20+。

---

## 三、微信小程序（B-INF-03）

### 3.1 公众平台

1. 登录 [微信公众平台](https://mp.weixin.qq.com/) → 开发 → 开发管理 → 开发设置  
2. **服务器域名** → request 合法域名添加：  
   - 生产：`https://geo.simplewin.cn`  
   - 预发（若使用）：`https://staging.geo.simplewin.cn`（搭建见 `B-INF_预发环境搭建.md`）  
3. 保存后等待生效（约几分钟）

### 3.2 小程序工程

1. 打开 `services/config.js`，设置：

```javascript
const ACTIVE_ENV = 'prod'      // 正式 / 提审
// const ACTIVE_ENV = 'staging' // 体验版联调预发（提审前改回 prod）
```

2. 微信开发者工具 → 详情 → 本地设置：  
   - **真机预览/体验版**：关闭「不校验合法域名」  
   - **仅本地调 localhost**：可临时开启，且 `ACTIVE_ENV = 'local'`

3. AppID：`project.config.json` 中 `wx54cc6c18cc01b815`（与公众平台一致）

### 3.3 登录（B-AUTH）

**真微信登录**（推荐生产）— 在服务器 `backend/.env` 增加：

```env
JWT_SECRET=<强随机串>
WECHAT_APP_ID=wx54cc6c18cc01b815
WECHAT_APP_SECRET=<公众平台 → 开发管理 → 开发设置 → AppSecret>
DEV_AUTH_ENABLED=false
```

部署：`npm run db:migrate` → `pm2 restart zhejian-api` → 真机重新登录（storage 中 token 变为 JWT）。

**联调 dev 桩**（`DEV_AUTH_ENABLED=true`）：**微信或 JWT 未配齐时**（含真机带 `code`）仍返回固定 dev token；三项都配齐后真机自动走 JWT 真登录。

---

## 四、Windows 本地验证

```powershell
# 先起本地 API
cd backend
npm run dev

# 另开终端
powershell -ExecutionPolicy Bypass -File scripts\verify-prod-api.ps1 -BaseUrl http://127.0.0.1:3000

# 生产（Nginx 配好后）
powershell -ExecutionPolicy Bypass -File scripts\verify-prod-api.ps1
```

---

## 五、真机冒烟（B-INF-04 扩展）

`ACTIVE_ENV = 'prod'` 且 health 通过后：

- [ ] 首页 / 我的 无「网络异常」
- [ ] 登录 → 我的页 summary
- [ ] 我的咨询列表
- [ ] 我的服务相册 → 详情
- [ ] 提交一条咨询

分享相册 + 手机号归属 → **B-AUTH + B-ALB-06** 后再测。

---

## 六、回滚

```bash
cd /var/www/zhejian
git checkout <上一版本>
cd backend && npm install && npm run db:migrate
sudo systemctl restart zhejian-api
```

数据库迁移一般只向前；回滚代码前确认 migration 兼容性。
