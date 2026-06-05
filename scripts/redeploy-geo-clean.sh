#!/bin/bash
# 辙见 · geo.simplewin.cn 干净重装（释放 3000 端口、去掉旧项目冲突）
#
# 背景：geo.simplewin.cn 专用于辙见（API + H5）；simplewin.cn 为公司官网，勿动。
#
# 用法：
#   sudo bash scripts/redeploy-geo-clean.sh --inspect   # 仅查看占用，不改动
#   sudo bash scripts/redeploy-geo-clean.sh --prepare   # 停旧服务、删重复 Nginx（需确认）
#   sudo bash scripts/redeploy-geo-clean.sh --deploy    # prepare 后跑 server-install.sh
set -euo pipefail

APP_ROOT="${ZHEJIAN_APP_ROOT:-/var/www/zhejian}"
MODE="${1:---inspect}"

log() { echo "==> $*"; }
warn() { echo "WARN: $*"; }

inspect() {
  log "监听 3000 的进程"
  ss -tlnp 2>/dev/null | grep ':3000' || echo "  （3000 未被监听）"

  log "可能相关的 systemd 服务"
  systemctl list-units --type=service --all 2>/dev/null \
    | grep -iE 'node|next|pm2|geo|simplewin|zhejian' || echo "  （无匹配）"

  log "Nginx 中含 geo.simplewin.cn 的配置"
  grep -rl 'server_name[^;]*geo\.simplewin\.cn' /etc/nginx/ 2>/dev/null || echo "  （无）"

  log "zhejian-api 状态"
  systemctl status zhejian-api --no-pager 2>/dev/null || echo "  （未安装或未运行）"

  echo ""
  echo "下一步："
  echo "  1. 停止并 disable 占用 3000 的旧项目服务（见上方 ss / systemctl）"
  echo "  2. git pull 后：sudo cp $APP_ROOT/backend/deploy/simplewin.conf /etc/nginx/conf.d/simplewin.conf"
  echo "     或：sudo bash $APP_ROOT/scripts/server-install.sh --simplewin-nginx"
  echo "  3. sudo bash scripts/redeploy-geo-clean.sh --prepare"
  echo "  4. 确认 backend/.env 中 PORT=3000"
  echo "  5. sudo bash scripts/redeploy-geo-clean.sh --deploy"
}

prepare() {
  log "删除辙见重复/半成品 Nginx 片段"
  rm -f /etc/nginx/conf.d/zhejian-api-location.inc
  rm -f /etc/nginx/conf.d/geo.simplewin.cn.conf

  if grep -rl 'server_name[^;]*geo\.simplewin\.cn' /etc/nginx/conf.d/simplewin.conf 2>/dev/null | grep -q simplewin.conf; then
    warn "simplewin.conf 仍含 geo.simplewin.cn — 请手动删除对应 server 块后再 --deploy"
    warn "  nano /etc/nginx/conf.d/simplewin.conf"
  fi

  if ss -tlnp 2>/dev/null | grep -q ':3000 '; then
    warn "3000 仍被占用，zhejian-api 无法启动。请先 stop/disable 旧服务。"
    ss -tlnp | grep ':3000' || true
    exit 1
  fi

  log "prepare 完成"
}

deploy() {
  prepare
  if [ ! -f "$APP_ROOT/backend/.env" ]; then
    echo "ERROR: 缺少 backend/.env，先执行 server-install.sh --init"
    exit 1
  fi
  if ! grep -qE '^PORT=3000' "$APP_ROOT/backend/.env" 2>/dev/null; then
    warn "建议 backend/.env 使用 PORT=3000（geo 专机已释放端口时）"
  fi
  bash "$APP_ROOT/scripts/server-install.sh"
}

case "$MODE" in
  --inspect) inspect ;;
  --prepare) prepare ;;
  --deploy) deploy ;;
  *)
    echo "用法: sudo bash scripts/redeploy-geo-clean.sh [--inspect|--prepare|--deploy]"
    exit 1
    ;;
esac
