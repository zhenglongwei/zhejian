/**
 * GEO-IGAIN-G02 · 服务页聚合统计覆盖率检查（运行时注入，无 DB 写入）
 */
require('dotenv').config()
const { H5_SERVICE_ITEMS } = require('../src/constants/h5-service-items')
const { getServiceItemPagePayload } = require('../src/services/h5-service-item.service')
const { scoreInformationGainText } = require('../src/services/geo-case-aggregate.service')

async function main() {
  const slugs = H5_SERVICE_ITEMS.map((item) => item.slug).filter(Boolean)
  let indexable = 0
  let withGain = 0

  for (const slug of slugs) {
    const payload = await getServiceItemPagePayload(slug)
    if (!payload.seo?.allowIndex) continue
    indexable += 1
    const score = scoreInformationGainText(payload.item.aiSummary)
    if (score >= 2) withGain += 1
    console.log('[geo-aggregate-backfill]', slug, {
      caseCount: payload.stats.caseCount,
      sampleSize: payload.aggregateStats?.sampleSize,
      informationGainScore: payload.aggregateStats?.informationGainScore,
      aiSummaryHead: String(payload.item.aiSummary || '').slice(0, 80),
    })
  }

  const rate = indexable ? Math.round((withGain / indexable) * 100) : 0
  console.log('[geo-aggregate-backfill] summary', { indexable, withGain, rate: `${rate}%` })
  if (indexable && rate < 50) {
    console.warn('[geo-aggregate-backfill] information_gain_rate 低于 50%，请补案例或检查聚合')
  }
}

main().catch((e) => {
  console.error('[geo-aggregate-backfill] ❌', e.message)
  process.exit(1)
})
