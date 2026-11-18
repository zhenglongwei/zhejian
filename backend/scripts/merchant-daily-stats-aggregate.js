/**
 * B-STATS-01：merchant_daily_stats 的写入端。
 * GET /merchant/stats 只读这张日表、不回查 event_tracking_log，所以本脚本一旦不跑，
 * 商家端所有浏览类指标就恒为 0。
 *
 * 用法：
 *   node scripts/merchant-daily-stats-aggregate.js                        # 昨日
 *   node scripts/merchant-daily-stats-aggregate.js --date=2026-11-03      # 单日
 *   node scripts/merchant-daily-stats-aggregate.js --from=2026-07-26 --to=2026-11-17   # 回填区间
 *   可加 --merchant-id=merchant_x / --store-id=store_x 限定范围
 */
require('dotenv').config()
const { runDailyAggregation } = require('../src/services/merchant-daily-stats.service')
const { yesterdayShanghai, listDateStrings } = require('../src/lib/shanghai-date')

function parseArgs(argv) {
  const out = {}
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)=(.*)$/)
    if (m) out[m[1].replace(/-/g, '_')] = m[2]
  }
  return out
}

function assertDateStr(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    throw new Error(`${label} 须为 YYYY-MM-DD（收到「${value || ''}」）`)
  }
  return value
}

function resolveDates(args) {
  if (!args.from && !args.to) {
    return [args.date ? assertDateStr(args.date, '--date') : yesterdayShanghai()]
  }
  if (!args.from || !args.to) throw new Error('--from 与 --to 须同时提供')
  const from = assertDateStr(args.from, '--from')
  const to = assertDateStr(args.to, '--to')
  const lastSettled = yesterdayShanghai()
  if (from > to) throw new Error('--from 不能晚于 --to')
  // 日表按 T+1 结算，cron 每天只处理「昨日」；写当天会留下一行再没人修正的半天数据
  if (to > lastSettled) throw new Error(`--to 最晚只能是昨日（${lastSettled}）`)
  return listDateStrings(from, to)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dates = resolveDates(args)
  for (const date of dates) {
    const result = await runDailyAggregation({
      date,
      merchantId: args.merchant_id,
      storeId: args.store_id,
    })
    console.log(`[aggregate] ${result.statDate} processed=${result.processed}`)
  }
  console.log(`[aggregate] 完成 ${dates.length} 天`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
