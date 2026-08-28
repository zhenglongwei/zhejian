# 盈简主站 brand-web

静态页，部署到 **simplewin.cn** 站点根（勿接到 geo.simplewin.cn 案例根）。

本地预览：

```
npx --yes serve brand-web -p 4173
```

体检页默认请求 `http://127.0.0.1:3000/api/v1/public/geo-check`（与本机 `backend/.env` 的 PORT 一致）。若 API 在 3100：

`http://127.0.0.1:4173/check.html?api=http://127.0.0.1:3100/api/v1/public/geo-check`

查看后端哪几路已配密钥：`GET http://127.0.0.1:3000/api/v1/public/geo-check/status`

Nginx 可增加无后缀路径：

```
location = /zhejian { try_files /zhejian.html =404; }
location = /check { try_files /check.html =404; }
```

生产切流：先把本仓库推到 GitHub，再在 ECS 执行 `sudo bash scripts/deploy-brand-web.sh`（只改 `simplewin.cn` 静态根，**不改** geo 案例站）。体检接口另需 `pm2 restart zhejian-api`。
