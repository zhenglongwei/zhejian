#!/usr/bin/env bash
# 北京时间每日 0:00 汇总「昨日」全店指标 → merchant_daily_stats
#
# 爬虫日志必须先入库再聚合：日聚合的 crawler_view_count 只数 event_tracking_log 里已有的
# h5_crawler_view 事件，顺序反了就会把昨日爬虫漏成 0。
# 同批删除、尚未恢复的 crawler-url-daily-aggregate / brand-search-daily-aggregate 不要加回这里。
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
  # ingest 失败不该拖垮日聚合，所以这里兜住错误继续往下走；缺的那部分靠 eventId 去重在下一次重跑补回。
  "$NODE_BIN" scripts/crawler-access-ingest.js || echo "[warn] crawler-ingest 失败，本轮爬虫计数未更新"
  "$NODE_BIN" scripts/merchant-daily-stats-aggregate.js
} >>"$LOG_FILE" 2>&1
