# 阿里云部署指南

目标：在 **8.155.0.128** 上运行 API，通过 **https://geo.simplewin.cn/api/v1/** 对外服务。

## 1. 服务器准备

```bash
# Ubuntu 22/24 示例
sudo apt update && sudo apt install -y git curl nginx

# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Docker（运行 PostgreSQL）
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
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
DATABASE_URL=postgresql://zhejian:STRONG_PASSWORD@127.0.0.1:5432/zhejian?schema=public
PUBLIC_BASE_URL=https://geo.simplewin.cn
DEV_AUTH_ENABLED=true
DEV_USER_TOKEN=请换成随机长字符串
```

修改 `docker-compose.yml` 中 PostgreSQL 密码与 `.env` 一致。

## 3. 启动数据库与 API

```bash
docker compose up -d
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
sudo cp deploy/nginx-geo.simplewin.cn.conf /etc/nginx/sites-available/geo.simplewin.cn
sudo ln -sf /etc/nginx/sites-available/geo.simplewin.cn /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

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
- [ ] PostgreSQL 仅监听 127.0.0.1
- [ ] 防火墙仅开放 80/443/22
- [ ] 定期备份 `docker volume zhejian_pg_data`
- [ ] 接入真实微信登录后再关闭 DEV_AUTH
