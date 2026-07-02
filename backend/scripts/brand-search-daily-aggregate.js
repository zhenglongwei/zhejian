/**
 * GEO-IGAIN-E02 · 品牌词/Direct 日聚合
 *   node scripts/brand-search-daily-aggregate.js
 *   node scripts/brand-search-daily-aggregate.js --date=2026-07-01
 */
require('dotenv').config()
const { aggregateBrandSearchDaily } = require('../src/services/brand-search-daily.service')

function readDateArg() {
  const arg = process.argv.find((item) => item.startsWith('--date='))
  return arg ? arg.split('=')[1] : undefined
}

async function main() {
  const result = await aggregateBrandSearchDaily({ date: readDateArg() })
  console.log('[brand-search-daily]', result)
}

main().catch((error) => {
  console.error('[brand-search-daily] failed', error.message)
  process.exit(1)
})
