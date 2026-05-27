#!/bin/bash
# zhejian-server-install: v2
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

#!/bin/bash
# zhejian-server-install: v2.1
# 辙见 · 服务器部署（B-INF-01～04）
# 支持：Alibaba Cloud Linux / CentOS（yum/dnf）、Ubuntu/Debian（apt）
#
# 用法：
#   sudo bash scripts/server-install.sh --init        # 仅生成 backend/.env
#   sudo bash scripts/server-install.sh                 # 迁移 + nginx + systemd
#   sudo bash scripts/server-install.sh --skip-nginx    # 跳过 Nginx（已手动合并 /api/ 时）
#   sudo bash scripts/server-install.sh --bootstrap     # 可选：安装 node/nginx（首次裸机）
set -euo pipefail

APP_ROOT="${ZHEJIAN_APP_ROOT:-/var/www/zhejian}"
MODE="${1:-}"
SKIP_NGINX=0

log() { echo "==> $*"; }
warn() { echo "WARN: $*"; }

read_env_var() {
  local file="$1" var="$2"
  grep -E "^${var}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^["'"'"']//;s/["'"'"']$//' || true
}

resolve_ssl_certificate_paths() {
  local env_file="$APP_ROOT/backend/.env"
  local cert="" key="" conf path

  if [ -f "$env_file" ]; then
    cert="$(read_env_var "$env_file" SSL_CERTIFICATE)"
    key="$(read_env_var "$env_file" SSL_CERTIFICATE_KEY)"
    if [ -n "$cert" ] && [ -f "$cert" ] && [ -n "$key" ] && [ -f "$key" ]; then
      echo "$cert|$key|backend/.env"
      return 0
    fi
  fi

  for conf in $(grep -rl 'server_name[^;]*geo\.simplewin\.cn' /etc/nginx/ 2>/dev/null || true); do
    cert="$(grep -E '^\s*ssl_certificate\s+' "$conf" 2>/dev/null | grep -v ssl_certificate_key | head -1 | awk '{print $2}' | tr -d ';' || true)"
    key="$(grep -E '^\s*ssl_certificate_key\s+' "$conf" 2>/dev/null | head -1 | awk '{print $2}' | tr -d ';' || true)"
    if [ -n "$cert" ] && [ -f "$cert" ] && [ -n "$key" ] && [ -f "$key" ]; then
      echo "$cert|$key|$conf"
      return 0
    fi
  done

  local candidates=(
    "/etc/nginx/ssl/geo.simplewin.cn/fullchain.pem|/etc/nginx/ssl/geo.simplewin.cn/privkey.pem"
    "/etc/letsencrypt/live/geo.simplewin.cn/fullchain.pem|/etc/letsencrypt/live/geo.simplewin.cn/privkey.pem"
    "/etc/nginx/cert/geo.simplewin.cn.pem|/etc/nginx/cert/geo.simplewin.cn.key"
    "/etc/nginx/cert/geo.simplewin.cn/fullchain.pem|/etc/nginx/cert/geo.simplewin.cn/privkey.pem"
  )
  for path in "${candidates[@]}"; do
    cert="${path%%|*}"
    key="${path##*|}"
    if [ -f "$cert" ] && [ -f "$key" ]; then
      echo "$cert|$key|default-path"
      return 0
    fi
  done

  while IFS= read -r cert; do
    [ -z "$cert" ] && continue
    if [ -f "$cert" ]; then
      key="${cert/fullchain.pem/privkey.pem}"
      if [ -f "$key" ]; then
        echo "$cert|$key|nginx-scan"
        return 0
      fi
    fi
  done < <(grep -rhE '^\s*ssl_certificate\s+' /etc/nginx/ 2>/dev/null | grep -v ssl_certificate_key | grep -v '#' | awk '{print $2}' | tr -d ';' | sort -u || true)

  return 1
}

print_ssl_help() {
  cat <<'EOF'
ERROR: 未找到 SSL 证书文件。

域名若已能 HTTPS 访问，证书路径应在现有 Nginx 配置里。请在服务器执行：

  grep -r ssl_certificate /etc/nginx/

将实际路径写入 backend/.env（取消注释并修改）：

  SSL_CERTIFICATE=/path/to/fullchain.pem
  SSL_CERTIFICATE_KEY=/path/to/privkey.pem

或创建符号链接后重跑：

  sudo mkdir -p /etc/nginx/ssl/geo.simplewin.cn
  sudo ln -sf /实际路径/fullchain.pem /etc/nginx/ssl/geo.simplewin.cn/fullchain.pem
  sudo ln -sf /实际路径/privkey.pem /etc/nginx/ssl/geo.simplewin.cn/privkey.pem

若已有 Next.js 站点、只需加 /api/ 反代：
  1. 编辑现有 geo.simplewin.cn 的 server 块，合并 backend/deploy/nginx-api-location.snippet.conf
  2. sudo nginx -t && sudo systemctl reload nginx
  3. sudo bash scripts/server-install.sh --skip-nginx
EOF
}

install_nginx_site() {
  local src="$APP_ROOT/backend/deploy/nginx-geo.simplewin.cn.conf"
  local rendered cert key source dest_dir
  local ssl_info

  if ! ssl_info="$(resolve_ssl_certificate_paths)"; then
    print_ssl_help
    exit 1
  fi

  cert="${ssl_info%%|*}"
  key="${ssl_info#*|}"
  key="${key%%|*}"
  source="${ssl_info##*|}"
  log "SSL 证书: $cert (来源: $source)"

  rendered="$(mktemp)"
  sed "s|__SSL_CERTIFICATE__|$cert|g; s|__SSL_CERTIFICATE_KEY__|$key|g" "$src" > "$rendered"

  if [ -d /etc/nginx/sites-available ]; then
    dest_dir="/etc/nginx/sites-available/geo.simplewin.cn"
    cp "$rendered" "$dest_dir"
    ln -sf "$dest_dir" /etc/nginx/sites-enabled/geo.simplewin.cn
  elif [ -d /etc/nginx/conf.d ]; then
    dest_dir="/etc/nginx/conf.d/geo.simplewin.cn.conf"
    cp "$rendered" "$dest_dir"
  else
    rm -f "$rendered"
    echo "ERROR: 找不到 Nginx 配置目录（sites-available 或 conf.d）"
    exit 1
  fi
  rm -f "$rendered"

  local existing_other
  existing_other="$(grep -rl 'server_name[^;]*geo\.simplewin\.cn' /etc/nginx/ 2>/dev/null | grep -v "$dest_dir" | head -1 || true)"
  if [ -n "$existing_other" ]; then
    warn "检测到其它 geo.simplewin.cn 配置: $existing_other"
    warn "若 Next.js 仍占 /api/，请合并 nginx-api-location.snippet.conf 或删除重复 server 块"
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

case "$MODE" in
  --skip-nginx) SKIP_NGINX=1; MODE="" ;;
  --init|--bootstrap) ;;
  "") ;;
  *)
    echo "用法: sudo bash scripts/server-install.sh [--init|--bootstrap|--skip-nginx]"
    exit 1
    ;;
esac

if [ ! -f "$APP_ROOT/backend/package.json" ]; then
  echo "ERROR: 未找到 $APP_ROOT/backend/package.json"
  echo "请先 git clone 或 git pull 到最新代码"
  exit 1
fi

# 旧版脚本含 WEB_ROOT= 且不含 install_nginx_site
if grep -q 'WEB_ROOT=' "$APP_ROOT/scripts/server-install.sh" 2>/dev/null \
  && ! grep -q 'install_nginx_site' "$APP_ROOT/scripts/server-install.sh" 2>/dev/null; then
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
node_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [ "$node_major" -lt 20 ] 2>/dev/null; then
  warn "Node $(node -v) < 20，建议升级: sudo bash scripts/server-install.sh --bootstrap"
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

if [ "$SKIP_NGINX" -eq 1 ]; then
  log "跳过 Nginx（--skip-nginx）"
else
  log "Nginx"
  install_nginx_site
fi

log "systemd zhejian-api"
install_systemd_unit

log "本机 health"
node scripts/verify-health.js http://127.0.0.1:3000

echo ""
echo "部署完成。外网验证:"
echo "  curl -s https://geo.simplewin.cn/api/v1/health"
echo "小程序: services/config.js → ACTIVE_ENV='prod'"
