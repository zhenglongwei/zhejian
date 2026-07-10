#!/usr/bin/env bash
# 商家套餐到期续费提醒 · 建议每日 10:00 执行
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/merchant-subscription-renew-notify.js
