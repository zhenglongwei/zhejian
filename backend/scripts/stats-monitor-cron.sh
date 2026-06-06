#!/usr/bin/env bash
# OPS-DATA-03：北京时间每日 0:30 检查昨日埋点与日聚合（须在 stats-aggregate-cron 之后）
set -euo pipefail

export TZ=Asia/Shanghai

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="${STATS_AGGREGATE_LOG_DIR:-$ROOT/logs}"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/stats-monitor.log"

{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') ====="
  if command -v node >/dev/null 2>&1; then
    node scripts/ops-data-monitor.js
  else
    echo "ERROR: node not in PATH"
    exit 1
  fi
} >>"$LOG_FILE" 2>&1
