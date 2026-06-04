/**
 * B-STATS-01：日聚合 job
 * 用法：
 *   node scripts/merchant-daily-stats-aggregate.js
 *   node scripts/merchant-daily-stats-aggregate.js --date=2026-06-03
 *   node scripts/merchant-daily-stats-aggregate.js --merchant-id=merchant_demo_1
 */
const { runDailyAggregation } = require('../src/services/merchant-daily-stats.service')

function parseArgs(argv) {
  const out = {}
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)=(.*)$/)
    if (m) out[m[1].replace(/-/g, '_')] = m[2]
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const result = await runDailyAggregation({
    date: args.date,
    merchantId: args.merchant_id,
    storeId: args.store_id,
  })
  console.log('[aggregate]', result)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
