#!/usr/bin/env bash
# GEO-AGG-11 · 日级 GEO 专题聚合重算（建议 crontab：30 2 * * *）
set -euo pipefail

export TZ=Asia/Shanghai

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="${GEO_AGGREGATE_LOG_DIR:-$ROOT/logs}"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/geo-aggregate-refresh.log"

{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') ====="
  if command -v node >/dev/null 2>&1; then
    node scripts/geo-aggregate-daily-refresh.js
  else
    echo "ERROR: node not in PATH"
    exit 1
  fi
} >>"$LOG_FILE" 2>&1
