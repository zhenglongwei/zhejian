#!/usr/bin/env bash
# GEO-OBS-B06/D02 · 周频 Prompt 探测（建议 crontab：0 3 * * 1）
# 多引擎：GEO_PROBE_ENGINES=qwen,doubao,kimi,wenxin,yuanbao（缺 Key 的引擎自动 skip）
set -euo pipefail

export TZ=Asia/Shanghai
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="${GEO_PROBE_LOG_DIR:-$ROOT/logs}"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/geo-probe.log"

echo "[geo-probe-cron] start $(date '+%Y-%m-%d %H:%M:%S %Z') → log: $LOG_FILE"
echo "[geo-probe-cron] live 探测（多引擎 GEO_PROBE_ENGINES），串行调用，通常需 5～60 分钟，请耐心等待"

{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') ====="
  echo "[geo-probe-cron] step 1/2 seed-sync"
  node scripts/geo-prompt-seed-sync.js
  echo "[geo-probe-cron] step 2/2 probe --live"
  node scripts/geo-prompt-probe.js --live
  echo "[geo-probe-cron] done $(date '+%Y-%m-%d %H:%M:%S %Z')"
} 2>&1 | tee -a "$LOG_FILE"

echo "[geo-probe-cron] finished $(date '+%Y-%m-%d %H:%M:%S %Z')"
