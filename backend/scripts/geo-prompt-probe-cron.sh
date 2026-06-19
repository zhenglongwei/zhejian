#!/usr/bin/env bash
# GEO-OBS-B06 · 周频 Prompt 探测（建议 crontab：0 3 * * 1）
set -euo pipefail

export TZ=Asia/Shanghai
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="${GEO_PROBE_LOG_DIR:-$ROOT/logs}"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/geo-probe.log"

{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') ====="
  node scripts/geo-prompt-seed-sync.js
  node scripts/geo-prompt-probe.js --live
} >>"$LOG_FILE" 2>&1
