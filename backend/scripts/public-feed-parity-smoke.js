/**
 * GEO-IGAIN-H06 · Feed 与页面 trustMeta / 聚合字段一致性抽查
 */
require('dotenv').config()
const { getCaseDetail } = require('../src/services/content.service')
const { getCaseFeedJson, getServiceFeedJson } = require('../src/services/public-feed.service')
const { getServiceItemPagePayload } = require('../src/services/h5-service-item.service')
const { H5_SERVICE_ITEMS } = require('../src/constants/h5-service-items')

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function main() {
  const slug = process.env.SMOKE_SERVICE_SLUG || 'brake-pad-replacement'
  const caseId = process.env.SMOKE_CASE_ID

  const payload = await getServiceItemPagePayload(slug)
  if (payload.seo?.allowIndex) {
    const feed = await getServiceFeedJson(slug)
    assert(feed.aiSummary === payload.item.aiSummary, '服务 Feed 摘要不一致')
    if (payload.aggregateStats?.sampleSize) {
      assert(feed.aggregateStats?.sampleSize === payload.aggregateStats.sampleSize, '聚合 sampleSize 不一致')
      if (payload.aggregateStats.advanced) {
        assert(feed.aggregateStats?.advanced, 'Feed 缺 advanced')
        assert(
          JSON.stringify(feed.aggregateStats.advanced) === JSON.stringify(payload.aggregateStats.advanced),
          'advanced 字段不一致'
        )
      }
    }
  }

  if (caseId) {
    const detail = await getCaseDetail(caseId)
    const caseRef = detail.slug || detail.seo?.slug || caseId
    if (detail.trustMeta && caseRef && detail.seo?.allowIndex !== false) {
      const caseFeed = await getCaseFeedJson(caseRef)
      assert(caseFeed.trustMeta, '案例 Feed 缺 trustMeta')
      assert(
        caseFeed.trustMeta.snapshotVersion === detail.trustMeta.snapshotVersion,
        '案例 trustMeta 不一致'
      )
    }
  }

  console.log('[public-feed-parity-smoke] ✅', { slug, caseChecked: Boolean(caseId) })
}

main().catch((e) => {
  console.error('[public-feed-parity-smoke] ❌', e.message)
  process.exit(1)
})
