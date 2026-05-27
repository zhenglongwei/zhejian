#!/bin/bash
# 辙见 · 服务器部署（B-INF-01～04）
# 支持：Alibaba Cloud Linux / CentOS（yum/dnf）、Ubuntu/Debian（apt）
#
# 用法：
#   sudo bash scripts/server-install.sh --init     # 仅生成 backend/.env
#   sudo bash scripts/server-install.sh            # 迁移 + nginx + systemd
#   sudo bash scripts/server-install.sh --bootstrap  # 可选：安装 node/nginx（首次裸机）
set -euo pipefail

APP_ROOT="${ZHEJIAN_APP_ROOT:-/var/www/zhejian}"
MODE="${1:-}"

log() { echo "==> $*"; }

detect_pkg_manager() {
  if command -v dnf >/dev/null 2>&1; then echo dnf
  elif command -v yum >/dev/null 2>&1; then echo yum
  elif command -v apt-get >/dev/null 2>&1; then echo apt
  else echo none
  fi
}

install_bootstrap_packages() {
  local pm
  pm="$(detect_pkg_manager)"
  log "系统包管理: $pm"
  case "$pm" in
    dnf)
      dnf install -y git curl nginx
      if ! command -v node >/dev/null 2>&1; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
        dnf install -y nodejs
      fi
      ;;
    yum)
      yum install -y git curl nginx
      if ! command -v node >/dev/null 2>&1; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
        yum install -y nodejs
      fi
      ;;
    apt)
      apt-get update -y
      apt-get install -y git curl nginx
      if ! command -v node >/dev/null 2>&1; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
      fi
      ;;
    *)
      log "WARN: 未识别包管理器，跳过 bootstrap（请自行安装 node、nginx）"
      ;;
  esac
}

install_nginx_site() {
  local src="$APP_ROOT/backend/deploy/nginx-geo.simplewin.cn.conf"
  if [ -d /etc/nginx/sites-available ]; then
    cp "$src" /etc/nginx/sites-available/geo.simplewin.cn
    ln -sf /etc/nginx/sites-available/geo.simplewin.cn /etc/nginx/sites-enabled/geo.simplewin.cn
  elif [ -d /etc/nginx/conf.d ]; then
    cp "$src" /etc/nginx/conf.d/geo.simplewin.cn.conf
  else
    echo "ERROR: 找不到 Nginx 配置目录（sites-available 或 conf.d）"
    exit 1
  fi
  nginx -t
  systemctl enable nginx 2>/dev/null || true
  systemctl reload nginx || systemctl restart nginx
}

detect_service_user() {
  if id www-data >/dev/null 2>&1; then echo www-data
  elif id nginx >/dev/null 2>&1; then echo nginx
  else echo root
  fi
}

install_systemd_unit() {
  local user
  user="$(detect_service_user)"
  log "systemd 运行用户: $user"
  sed "s/^User=.*/User=$user/" "$APP_ROOT/backend/deploy/zhejian-api.service" \
    | sed "s/^Group=.*/Group=$user/" \
    > /etc/systemd/system/zhejian-api.service
  systemctl daemon-reload
  systemctl enable zhejian-api
  systemctl restart zhejian-api
  sleep 2
  systemctl is-active zhejian-api
}

log "辙见部署 · APP_ROOT=$APP_ROOT"

if [ ! -f "$APP_ROOT/backend/package.json" ]; then
  echo "ERROR: 未找到 $APP_ROOT/backend/package.json"
  echo "请先 git clone 或 git pull 到最新代码"
  exit 1
fi

# 旧版脚本特征：首行日志含「网站 /var/www/geo.simplewin.cn」
if grep -q '网站 /var/www/geo.simplewin.cn' "$APP_ROOT/scripts/server-install.sh" 2>/dev/null; then
  echo "WARN: 检测到旧版 server-install.sh，请 git pull 后重试"
  exit 1
fi

if [ "$MODE" = "--bootstrap" ]; then
  install_bootstrap_packages
  exit 0
fi

if [ "$MODE" = "--init" ] || [ ! -f "$APP_ROOT/backend/.env" ]; then
  cp "$APP_ROOT/backend/.env.production.example" "$APP_ROOT/backend/.env"
  echo ""
  echo "已生成 $APP_ROOT/backend/.env"
  echo "请编辑 DATABASE_URL、DEV_*_TOKEN 后执行:"
  echo "  sudo bash $APP_ROOT/scripts/server-install.sh"
  exit 0
fi

if grep -qE 'YOUR_PASSWORD|请改成随机' "$APP_ROOT/backend/.env"; then
  echo "ERROR: 请先修改 backend/.env 中的 DATABASE_URL 与 DEV_*_TOKEN"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: 未找到 node。可执行: sudo bash scripts/server-install.sh --bootstrap"
  exit 1
fi
if ! command -v nginx >/dev/null 2>&1; then
  echo "ERROR: 未找到 nginx。可执行: sudo bash scripts/server-install.sh --bootstrap"
  exit 1
fi

cd "$APP_ROOT/backend"
log "npm install"
npm install

log "db:migrate (生产不强制 seed)"
npm run db:setup:prod

log "Nginx"
install_nginx_site

log "systemd zhejian-api"
install_systemd_unit

log "本机 health"
node scripts/verify-health.js http://127.0.0.1:3000

echo ""
echo "部署完成。外网验证:"
echo "  curl -s https://geo.simplewin.cn/api/v1/health"
echo "小程序: services/config.js → ACTIVE_ENV='prod'"
