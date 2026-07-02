/**
 * GEO-IGAIN-E02 · brand_search_daily 聚合冒烟
 */
require('dotenv').config()
const { aggregateBrandSearchDaily } = require('../src/services/brand-search-daily.service')

async function main() {
  const result = await aggregateBrandSearchDaily({ date: new Date() })
  console.log('[brand-search-daily-smoke] ok', result)
}

main().catch((error) => {
  console.error('[brand-search-daily-smoke] failed', error.message)
  process.exit(1)
})
