/**
 * GEO-OBS-A03 · 爬虫 URL 日聚合
 *   node scripts/crawler-url-daily-aggregate.js
 *   node scripts/crawler-url-daily-aggregate.js --date=2026-06-16
 */
require('dotenv').config()
const { aggregateCrawlerUrlDaily } = require('../src/services/crawler-url-daily.service')

function readDateArg() {
  const arg = process.argv.find((item) => item.startsWith('--date='))
  return arg ? arg.split('=')[1] : undefined
}

async function main() {
  const result = await aggregateCrawlerUrlDaily({ date: readDateArg() })
  console.log('[crawler-url-daily]', result)
}

main().catch((error) => {
  console.error('[crawler-url-daily] failed', error.message)
  process.exit(1)
})
