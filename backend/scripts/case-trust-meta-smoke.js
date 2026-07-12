/**
 * GEO-TRUST-09 · trustMeta H5/Feed/Schema 一致性冒烟
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { getCaseDetail } = require('../src/services/content.service')
const { getCaseFeedJson } = require('../src/services/public-feed.service')
const { buildCasePageSchemaGraph } = require('../src/lib/schema-graph')
const { config } = require('../src/config')
const { extractSnapshotFromContentJson } = require('../src/schemas/case-snapshot.schema')

const prisma = new PrismaClient()

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function pickCase() {
  const envId = process.env.SMOKE_CASE_ID
  if (envId) return envId
  const row = await prisma.publicCase.findFirst({
    where: { status: 'public_approved' },
    orderBy: { updatedAt: 'desc' },
  })
  if (!row) throw new Error('无已发布案例')
  if (!extractSnapshotFromContentJson(row.contentJson)) {
    throw new Error('案例无 snapshot，请先跑 case:snapshot-legacy-backfill 或 case:snapshot-smoke')
  }
  return row.id
}

async function main() {
  const caseId = await pickCase()
  const detail = await getCaseDetail(caseId)
  assert(detail.trustMeta, '案例详情应含 trustMeta')
  assert(detail.trustMeta.snapshotVersion >= 1, 'trustMeta.snapshotVersion 无效')
  assert(detail.trustMeta.authorizationTierLabel, '缺少 authorizationTierLabel')

  const slug = detail.slug || detail.seo?.slug
  const caseRef = slug || caseId
  if (detail.seo?.allowIndex !== false && caseRef) {
    const feed = await getCaseFeedJson(caseRef)
    assert(feed.trustMeta, 'Feed 应含 trustMeta')
    assert(
      feed.trustMeta.snapshotVersion === detail.trustMeta.snapshotVersion,
      'Feed trustMeta 与详情不一致'
    )
  }

  const graph = buildCasePageSchemaGraph({
    baseUrl: config.publicBaseUrl,
    showStorePublicly: false,
    data: {
      ...detail,
      trustMeta: detail.trustMeta,
    },
  })
  const article = (graph['@graph'] || []).find((node) => node['@type'] === 'Article')
  assert(article?.additionalProperty?.length, 'Schema Article 应含 additionalProperty')

  console.log('[case-trust-meta-smoke] ✅', caseId, {
    tier: detail.trustMeta.authorizationTierLabel,
    evidence: detail.trustMeta.evidenceLevel,
  })
}

main()
  .catch((e) => {
    console.error('[case-trust-meta-smoke] ❌', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
