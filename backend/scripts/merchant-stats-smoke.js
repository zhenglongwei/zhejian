/**
 * B-STATS 冒烟：聚合 + GET /merchant/stats
 * 用法：
 *   npm run stats:smoke
 *   node scripts/merchant-stats-smoke.js http://127.0.0.1:3002
 *   node scripts/merchant-stats-smoke.js --no-http   # 仅测聚合+service，不启 API
 *
 * HTTP 部分需 API 已启动（npm run dev）；BASE 默认读 .env 的 PORT（config.publicBaseUrl）
 */
require('dotenv').config()
const { runDailyAggregation, fetchMerchantStats } = require('../src/services/merchant-daily-stats.service')
const { config } = require('../src/config')

const argv = process.argv.slice(2)
const NO_HTTP = argv.includes('--no-http')
const BASE =
  argv.find((a) => !a.startsWith('--')) ||
  process.env.SMOKE_BASE_URL ||
  process.env.API_BASE ||
  config.publicBaseUrl
const MERCHANT_TOKEN = config.devTokens.merchant

async function api(method, path, query) {
  const qs = query
    ? '?' +
      Object.entries(query)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    : ''
  const res = await fetch(`${BASE}${path}${qs}`, {
    method,
    headers: { Authorization: `Bearer ${MERCHANT_TOKEN}` },
  })
  const json = await res.json()
  if (!res.ok || json.code !== 0) {
    throw new Error(`${method} ${path} failed: ${json.message || res.status}`)
  }
  return json.data
}

async function main() {
  const agg = await runDailyAggregation({ merchantId: 'merchant_demo_1' })
  console.log('[smoke] aggregate', agg)

  let stats
  if (NO_HTTP) {
    stats = await fetchMerchantStats(
      {
        merchantId: 'merchant_demo_1',
        userId: 'user_demo_1',
        storeId: 'store_demo_1',
      },
      { storeId: 'store_demo_1', period: '7d' }
    )
    console.log('[smoke] fetchMerchantStats (in-process)')
  } else {
    try {
      stats = await api('GET', '/api/v1/merchant/stats', {
        storeId: 'store_demo_1',
        period: '7d',
      })
    } catch (e) {
      if (e.cause?.code === 'ECONNREFUSED' || e.message?.includes('fetch failed')) {
        console.error(
          `[smoke] 无法连接 ${BASE}，请先启动 API：npm run dev（当前 .env PORT=${config.port}）`
        )
        console.error('[smoke] 或仅测服务层：node scripts/merchant-stats-smoke.js --no-http')
      }
      throw e
    }
  }

  console.log('[smoke] stats summary', stats.summary)
  console.log('[smoke] series days', stats.series?.length)
  console.log('[smoke] transparency', stats.transparency)
  console.log('[smoke] OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
