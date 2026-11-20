# 盈简主站 brand-web

静态页，部署到 **simplewin.cn** 站点根（勿接到 zhejian.simplewin.cn 案例根）。

本地预览：

```
npx --yes serve brand-web -p 4173
```

Nginx 可增加无后缀路径：

```
location = /zhejian { try_files /zhejian.html =404; }
```

生产切流：先把本仓库推到 GitHub，再在 ECS 执行 `sudo bash scripts/deploy-brand-web.sh`（只改 `simplewin.cn` 静态根，**不改** geo 案例站）。
