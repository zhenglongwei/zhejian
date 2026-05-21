#!/bin/bash
# 辙见 · 阿里云服务器首次部署（在服务器上以 root 或 sudo 执行）
# 用法：
#   curl -fsSL https://raw.githubusercontent.com/YOUR_USER/zhejian/main/scripts/server-install.sh | bash
# 或 git clone 后：
#   sudo bash /var/www/zhejian/scripts/server-install.sh
set -euo pipefail

APP_ROOT="/var/www/zhejian"
WEB_ROOT="/var/www/geo.simplewin.cn"
REPO_URL="${ZHEJIAN_REPO_URL:-}"  # 例：https://github.com/你的用户名/zhejian.git

echo "==> 目录：代码 $APP_ROOT ，网站 $WEB_ROOT"

apt-get update -y
apt-get install -y git curl nginx

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

mkdir -p "$WEB_ROOT/public" "$WEB_ROOT/admin"
mkdir -p "$APP_ROOT"

if [ -n "$REPO_URL" ] && [ ! -d "$APP_ROOT/.git" ]; then
  git clone "$REPO_URL" "$APP_ROOT"
elif [ ! -f "$APP_ROOT/backend/package.json" ]; then
  echo "请先把代码放到 $APP_ROOT（git clone 或上传），再重新运行本脚本"
  echo "示例：git clone https://github.com/你的用户名/zhejian.git $APP_ROOT"
  exit 1
fi

cd "$APP_ROOT/backend"

if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "!!! 请编辑 $APP_ROOT/backend/.env ："
  echo "    DATABASE_URL=mysql://用户:密码@127.0.0.1:3306/zhejian"
  echo "    DEV_USER_TOKEN=改成随机长字符串"
  echo "编辑完成后重新运行: sudo bash scripts/server-install.sh --continue"
  exit 0
fi

if [ "${1:-}" != "--continue" ] && grep -q "YOUR_PASSWORD" .env 2>/dev/null; then
  echo "请先修改 backend/.env 中的 DATABASE_URL 和密码，再执行:"
  echo "  sudo bash $APP_ROOT/scripts/server-install.sh --continue"
  exit 1
fi

npm install
npm run db:setup

# 发布 H5 到 public
rsync -a --delete "$APP_ROOT/h5/" "$WEB_ROOT/public/" 2>/dev/null || cp -a "$APP_ROOT/h5/." "$WEB_ROOT/public/"

# 运营后台占位页
if [ ! -f "$WEB_ROOT/admin/index.html" ]; then
  cp "$APP_ROOT/admin-web/placeholder/index.html" "$WEB_ROOT/admin/index.html"
fi

# Nginx
cp "$APP_ROOT/backend/deploy/nginx-geo.simplewin.cn.conf" /etc/nginx/sites-available/geo.simplewin.cn
ln -sf /etc/nginx/sites-available/geo.simplewin.cn /etc/nginx/sites-enabled/geo.simplewin.cn
nginx -t
systemctl reload nginx

# systemd
sed "s|/opt/zhejian|$APP_ROOT|g" "$APP_ROOT/backend/deploy/zhejian-api.service" > /etc/systemd/system/zhejian-api.service
systemctl daemon-reload
systemctl enable zhejian-api
systemctl restart zhejian-api

echo ""
echo "部署完成。请测试："
echo "  curl -s https://geo.simplewin.cn/api/v1/health"
echo "  curl -sI https://geo.simplewin.cn/admin/"
