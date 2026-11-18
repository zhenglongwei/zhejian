#!/usr/bin/env bash
# 北京时间每日 0:00 汇总「昨日」全店指标 → merchant_daily_stats
#
# 同批删除、尚未恢复的 crawler-access-ingest / crawler-url-daily-aggregate /
# brand-search-daily-aggregate 不要加回这里：set -e 会让整轮任务在第一个缺失脚本处终止。
set -euo pipefail

export TZ=Asia/Shanghai

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# cron 的默认 PATH 命中 /bin/node（v18），而 backend engines 要求 >=20、PM2 跑的是 nvm v20。
# 不钉住就会出现「手动能跑、凌晨静默失败」。
if [ -z "${NODE_BIN:-}" ]; then
  NODE_BIN="$(ls -d /root/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1)"
fi
[ -x "${NODE_BIN:-}" ] || NODE_BIN="$(command -v node || true)"
[ -n "$NODE_BIN" ] || { echo "ERROR: node not found"; exit 1; }

LOG_DIR="${STATS_AGGREGATE_LOG_DIR:-$ROOT/logs}"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/stats-aggregate.log"

{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') node=$("$NODE_BIN" --version) ====="
  "$NODE_BIN" scripts/merchant-daily-stats-aggregate.js
} >>"$LOG_FILE" 2>&1
