#!/usr/bin/env bash
# 在 ECS 上执行：把 simplewin.cn 切到本仓库 brand-web，不改 geo.simplewin.cn 案例根。
# 前置：已 git push，且 /var/www/zhejian git pull 到含 brand-web 的提交。
set -euo pipefail

ROOT=/var/www/zhejian
CONF_SRC="$ROOT/backend/deploy/simplewin.conf"
CONF_DST=/etc/nginx/conf.d/simplewin.conf
STAMP=$(date +%Y%m%d%H%M%S)

if [[ ! -f "$ROOT/brand-web/index.html" ]]; then
  echo "缺少 $ROOT/brand-web/index.html。先 git pull 再跑本脚本。"
  exit 1
fi

if [[ ! -f "$CONF_SRC" ]]; then
  echo "缺少 $CONF_SRC"
  exit 1
fi

if ! grep -q "root /var/www/zhejian/brand-web" "$CONF_SRC"; then
  echo "$CONF_SRC 未指向 brand-web，中止以免切错站。"
  exit 1
fi

if ! grep -q "server_name geo.simplewin.cn" "$CONF_SRC"; then
  echo "$CONF_SRC 没有 geo 块，中止。"
  exit 1
fi

sudo cp -a "$CONF_DST" "${CONF_DST}.bak.${STAMP}"
sudo cp "$CONF_SRC" "$CONF_DST"
sudo nginx -t
sudo systemctl reload nginx

echo "Nginx 已 reload。请验证 https://simplewin.cn/ 与 https://geo.simplewin.cn/ （案例站应仍在）。"
echo "体检接口另需：cd $ROOT/backend && pm2 restart zhejian-api"
