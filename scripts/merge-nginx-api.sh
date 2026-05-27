#!/bin/bash
# 辙见 · 将 /api/ 反代合并到已有 geo.simplewin.cn Nginx 配置（避免 server_name 冲突）
# 用法：sudo bash scripts/merge-nginx-api.sh
set -euo pipefail

APP_ROOT="${ZHEJIAN_APP_ROOT:-/var/www/zhejian}"
INC_SRC="$APP_ROOT/backend/deploy/nginx-api-location.inc"
INC_DEST="/etc/nginx/conf.d/zhejian-api-location.inc"
MARKER="zhejian-api-location.inc"
DOMAIN='geo\.simplewin\.cn'

log() { echo "==> $*"; }
warn() { echo "WARN: $*"; }

read_env_var() {
  local file="$1" var="$2"
  grep -E "^${var}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^["'"'"']//;s/["'"'"']$//' || true
}

if [ "$(id -u)" -ne 0 ]; then
  echo "请使用 sudo 运行"
  exit 1
fi

find_geo_conf() {
  local f
  for f in $(grep -rl "server_name[^;]*${DOMAIN}" /etc/nginx/ 2>/dev/null || true); do
    case "$f" in
      *geo.simplewin.cn.conf|*zhejian-api-location.inc) continue ;;
    esac
    echo "$f"
    return 0
  done
  return 1
}

remove_duplicate_site() {
  local dup
  for dup in \
    /etc/nginx/conf.d/geo.simplewin.cn.conf \
    /etc/nginx/sites-enabled/geo.simplewin.cn \
    /etc/nginx/sites-available/geo.simplewin.cn; do
    if [ -f "$dup" ]; then
      warn "删除重复整站配置: $dup"
      rm -f "$dup"
    fi
  done
}

read_api_port() {
  local port
  port="$(read_env_var "$APP_ROOT/backend/.env" PORT)"
  echo "${port:-3002}"
}

render_api_location_inc() {
  local port
  port="$(read_api_port)"
  sed "s|__ZHEJIAN_API_PORT__|$port|g" "$INC_SRC" > "$INC_DEST"
  chmod 644 "$INC_DEST"
  log "API upstream: 127.0.0.1:$port"
}

merge_api_into_conf() {
  local conf="$1"
  local tmp

  render_api_location_inc

  if grep -q "$MARKER" "$conf"; then
    log "已含 include，已刷新 upstream 端口: $conf"
    return 0
  fi
  if grep -qE 'location\s+/api/' "$conf"; then
    warn "已有 location /api/，请确认 proxy_pass 端口为 $(read_api_port): $conf"
    return 0
  fi

  tmp="$(mktemp)"
  awk -v marker="$MARKER" '
    BEGIN { in_geo=0; inserted=0 }
    /server_name[^;]*geo\.simplewin\.cn/ { in_geo=1 }
    in_geo && /^\s*server\s*\{/ { in_geo=1 }
    in_geo && /^\s*\}/ {
      if (!inserted) {
        print "    include /etc/nginx/conf.d/" marker ";"
        inserted=1
      }
      in_geo=0
    }
    in_geo && /^\s*location\s+\// && !inserted {
      print "    include /etc/nginx/conf.d/" marker ";"
      inserted=1
    }
    { print }
  ' "$conf" > "$tmp"

  if ! grep -q "$MARKER" "$tmp"; then
    rm -f "$tmp"
    echo "ERROR: 未能自动插入 include，请手动编辑 $conf"
    echo "  在 geo.simplewin.cn 的 server { } 内、location / 之前添加："
    echo "    include /etc/nginx/conf.d/zhejian-api-location.inc;"
    exit 1
  fi

  cp "$conf" "${conf}.bak.$(date +%Y%m%d%H%M%S)"
  mv "$tmp" "$conf"
  log "已合并 /api/ 到 $conf"
}

main() {
  local geo_conf
  if ! geo_conf="$(find_geo_conf)"; then
    echo "ERROR: 未找到含 server_name geo.simplewin.cn 的 Nginx 配置"
    exit 1
  fi

  log "目标配置: $geo_conf"
  remove_duplicate_site
  merge_api_into_conf "$geo_conf"

  nginx -t
  systemctl reload nginx || systemctl restart nginx
  log "完成。验证: curl -s https://geo.simplewin.cn/api/v1/health"
}

main "$@"
