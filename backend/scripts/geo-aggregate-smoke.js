/**
 * GEO-IGAIN-A08 · 聚合统计 → 服务 API → JSON Feed 冒烟
 */
require('dotenv').config()
const { aggregatePublicCases, buildAggregateAiSummary } = require('../src/services/geo-case-aggregate.service')
const { getServiceItemPagePayload } = require('../src/services/h5-service-item.service')
const { getServiceFeedJson, getFeedIndexJson } = require('../src/services/public-feed.service')

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function main() {
  const mockCases = [
    { inspectResult: '刹车片磨损接近极限', planAmount: 420, seoNoindex: false },
    { inspectResult: '刹车盘存在轻微拉痕', planAmount: 500, seoNoindex: false },
    { inspectResult: '片厚不足', minAmount: 380, maxAmount: 460, seoNoindex: false },
  ]
  const stats = aggregatePublicCases(mockCases, { priceMode: 'range' })
  assert(stats.sampleSize === 3, 'sampleSize 应为 3')
  assert(stats.informationGainScore >= 1, '应有 informationGainScore')
  const summary = buildAggregateAiSummary({
    serviceName: '刹车片更换',
    city: '杭州',
    aggregateStats: stats,
  })
  assert(summary.includes('3 例脱敏案例'), '摘要应含样本量')

  const slug = 'brake-pad-replacement'
  const payload = await getServiceItemPagePayload(slug)
  assert(payload.aggregateStats, '服务页 payload 应含 aggregateStats')
  assert(payload.item.aiSummary, '服务页应有 aiSummary')
  if (payload.stats.caseCount > 0) {
    assert(
      payload.item.aiSummary.includes('例') || payload.item.aiSummary.includes('案例'),
      '有案例时摘要应含案例统计表述'
    )
  }

  if (payload.seo && payload.seo.allowIndex) {
    const feed = await getServiceFeedJson(slug)
    assert(feed.type === 'service', 'Feed type 应为 service')
    assert(feed.aiSummary === payload.item.aiSummary, 'Feed 摘要应与页面一致')
    assert(feed.disclaimer, 'Feed 应含 disclaimer')
    if (payload.aggregateStats?.sampleSize) {
      assert(
        feed.aggregateStats?.sampleSize === payload.aggregateStats.sampleSize,
        'Feed aggregateStats.sampleSize 不一致'
      )
      if (payload.aggregateStats.advanced) {
        assert(feed.aggregateStats?.advanced, 'Feed 应含 advanced')
      }
    }
  }

  const index = await getFeedIndexJson()
  assert(index.stats?.serviceCount >= 1, 'index.json 应含 stats')
  assert(index.fieldContract?.trustMeta, 'index.json 应含 fieldContract')

  console.log('[geo-aggregate-smoke] ok', {
    slug,
    caseCount: payload.stats.caseCount,
    sampleSize: payload.aggregateStats.sampleSize,
    hasSummary: Boolean(payload.item.aiSummary),
  })
}

main().catch((err) => {
  console.error('[geo-aggregate-smoke] failed:', err.message)
  process.exit(1)
})
