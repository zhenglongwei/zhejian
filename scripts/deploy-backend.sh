#!/usr/bin/env bash
# 在 ECS 上执行：拉代码 → 跑迁移 → 重启 API → 健康检查
#
# 为什么要有这个脚本：部署漏掉 `prisma migrate deploy` 是本项目出过的一类事故——
# 代码引用了新字段、库里没有那一列，接口直接 500，而页面只会显示「暂时不可用」，
# 看不出是迁移没跑。这个脚本把迁移放在重启之前，并且在重启后真去打几个接口。
#
# 用法：bash scripts/deploy-backend.sh
set -euo pipefail

ROOT=/var/www/zhejian
API_NAME=zhejian-api

cd "$ROOT"

echo "==> 1/5 拉代码"
git pull --ff-only

echo "==> 2/5 装依赖（有锁文件变动时才真的会动）"
cd "$ROOT/backend"
npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

echo "==> 3/5 生成 Prisma Client + 跑迁移"
# 这一步不能跳过。schema 改了而库没跟上，接口会 500 在第一次查库的地方。
npm run db:setup:prod

echo "==> 4/5 重启 API"
pm2 restart "$API_NAME" --update-env
sleep 3

echo "==> 5/5 健康检查"
BASE=https://geo.simplewin.cn/api/v1/public

check() {
  local label="$1"
  local url="$2"
  local code
  # 不能写 `code=$(curl ... || echo 000)`：curl 有可能先吐出状态码再以非零退出
  # （写响应体失败之类），那样兜底字符串会直接拼在状态码后面，变成 200000，
  # 健康的接口被误报成故障。分两步取。
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$url" || true)
  if [ "$code" = "200" ]; then
    echo "  OK   $label ($code)"
  else
    echo "  FAIL $label (HTTP ${code:-无响应}) —— $url"
    FAILED=1
  fi
}

FAILED=0
check "体检状态"   "$BASE/geo-check/status"
check "榜单主接口" "$BASE/geo-ranking"
check "榜单概况"   "$BASE/geo-ranking/insights"

if [ "$FAILED" != "0" ]; then
  echo ""
  echo "有接口没起来。看日志："
  echo "  pm2 logs $API_NAME --lines 80 --nostream"
  exit 1
fi

echo ""
echo "部署完成。"
echo "前端若也有改动，另跑：sudo bash $ROOT/scripts/deploy-brand-web.sh"
