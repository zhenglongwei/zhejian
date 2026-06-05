#!/usr/bin/env bash
# 生产 crontab 入口：北京时间每日 0:00 执行，汇总「昨日」全店指标 → merchant_daily_stats
set -euo pipefail

export TZ=Asia/Shanghai

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# 默认写在 backend/logs（与仓库同目录）；可用 STATS_AGGREGATE_LOG_DIR 覆盖
LOG_DIR="${STATS_AGGREGATE_LOG_DIR:-$ROOT/logs}"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/stats-aggregate.log"

{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') ====="
  if command -v node >/dev/null 2>&1; then
    node scripts/merchant-daily-stats-aggregate.js
  else
    echo "ERROR: node not in PATH"
    exit 1
  fi
} >>"$LOG_FILE" 2>&1
