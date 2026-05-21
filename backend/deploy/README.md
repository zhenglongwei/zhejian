# 阿里云部署指南

目标：在 **8.155.0.128** 上运行 **辙见** 服务，通过 **geo.simplewin.cn** 对外提供 API、H5 与运营后台。

| 路径 | 说明 |
|---|---|
| `/api/v1/` | 主业务 API（本 backend） |
| `/admin/` | 运营后台 Web（后续 `admin-web/` 构建部署） |
| `/` | H5 公开页 / SEO·GEO |

公司官网 **simplewin.cn**（盈简科技）与本域名分离部署。  
架构说明见 `docs/10_技术架构与接口/10_域名与部署架构.md`。

## 1. 服务器准备

```bash
# Ubuntu 22/24 示例
sudo apt update && sudo apt install -y git curl nginx

# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Docker（可选，本地无 MySQL 时用）
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

生产环境若 **已有 MySQL**，跳过 Docker，直接在 MySQL 里建库：

```sql
CREATE DATABASE zhejian CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'zhejian'@'127.0.0.1' IDENTIFIED BY '你的强密码';
GRANT ALL PRIVILEGES ON zhejian.* TO 'zhejian'@'127.0.0.1';
FLUSH PRIVILEGES;
```

## 2. 拉取代码

```bash
cd /opt
sudo git clone https://github.com/YOUR_ORG/zhejian.git
sudo chown -R $USER:$USER zhejian
cd zhejian/backend
cp .env.example .env
```

编辑 `.env`：

```env
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
DATABASE_URL=mysql://zhejian:STRONG_PASSWORD@127.0.0.1:3306/zhejian
PUBLIC_BASE_URL=https://geo.simplewin.cn
DEV_AUTH_ENABLED=true
DEV_USER_TOKEN=请换成随机长字符串
```

修改 `docker-compose.yml` 中 MySQL 密码与 `.env` 一致（**仅本地 docker 开发需要**）。

## 3. 启动 API

```bash
npm install
npm run db:setup
```

使用 systemd 守护（可选）：

```bash
sudo cp deploy/zhejian-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now zhejian-api
```

或临时启动：`npm start`

## 4. Nginx

```bash
sudo mkdir -p /var/www/geo.simplewin.cn/public
sudo mkdir -p /var/www/geo.simplewin.cn/admin
sudo cp deploy/nginx-geo.simplewin.cn.conf /etc/nginx/sites-available/geo.simplewin.cn
sudo ln -sf /etc/nginx/sites-available/geo.simplewin.cn /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

- `public/`：部署 `h5/` 等 SEO 公开页
- `admin/`：部署运营后台构建产物（入口 `https://geo.simplewin.cn/admin/`）

验证：

```bash
curl -s https://geo.simplewin.cn/api/v1/health
```

## 5. 微信小程序

1. 微信公众平台 → 服务器域名 → request 合法域名：`https://geo.simplewin.cn`
2. 小程序 `services/config.js`：

```javascript
mode: 'dev',
baseUrl: 'https://geo.simplewin.cn',
```

3. 登录后把 `dev_user_token` 写入本地 storage 的 `token`（联调期；正式接入微信登录后替换）

## 6. 安全清单

- [ ] 修改所有 DEV_*_TOKEN 默认值
- [ ] MySQL 仅允许本机或内网访问（API 同机时用 127.0.0.1）
- [ ] 防火墙仅开放 80/443/22
- [ ] 定期备份 MySQL 数据库 `zhejian`
- [ ] 接入真实微信登录后再关闭 DEV_AUTH
