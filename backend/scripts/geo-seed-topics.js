/**
 * GEO-TOPIC-D03 · 导入首批 30 条意图种子到 geo_pages
 *
 * 用法：
 *   node scripts/geo-seed-topics.js
 *   node scripts/geo-seed-topics.js --publish
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { GEO_TOPIC_SEED_LIST } = require('../src/constants/geo-topic-seed-list')
const { GEO_PAGE_STATUS } = require('../src/constants/geo-page-status')
const { generateGeoPageDrafts } = require('../src/services/geo-page-generator.service')
const { normalizeFaq, normalizeFaqLinks, normalizeServiceMeta } = require('../src/schemas/geo-page.schema')

const prisma = new PrismaClient()
const PUBLISH = process.argv.includes('--publish')

function toDbRow(draft, status, publishedAt) {
  return {
    slug: draft.slug,
    title: draft.title,
    summary: draft.summary,
    coverImage: draft.coverImage || '',
    pageType: draft.pageType,
    city: draft.city || '',
    serviceId: draft.serviceId || '',
    faultTag: draft.faultTag || '',
    vehicleSeries: draft.vehicleSeries || '',
    keywordsJson: draft.keywords || [],
    scenariosJson: draft.scenarios || [],
    priceFactorsJson: draft.priceFactors || [],
    faqJson: normalizeFaq(draft.faq || []),
    faqLinksJson: normalizeFaqLinks(draft.faqLinks || []),
    relatedCaseIdsJson: draft.relatedCaseIds || [],
    relatedStoreIdsJson: draft.relatedStoreIds || [],
    primaryStoreId: draft.primaryStoreId || '',
    relatedServiceId: draft.relatedServiceId || '',
    seoTitle: draft.seoTitle || '',
    seoDescription: draft.seoDescription || '',
    aiSummary: draft.aiSummary || '',
    serviceMetaJson: normalizeServiceMeta(draft.serviceMeta || {}),
    status,
    publishedAt,
  }
}

async function main() {
  const drafts = generateGeoPageDrafts(GEO_TOPIC_SEED_LIST)
  const status = PUBLISH ? GEO_PAGE_STATUS.PUBLISHED : GEO_PAGE_STATUS.DRAFT
  const publishedAt = PUBLISH ? new Date() : null

  let created = 0
  let updated = 0
  let skipped = 0

  for (const draft of drafts) {
    if (!draft.id) {
      console.warn('[geo-seed-topics] skip invalid slug draft')
      skipped += 1
      continue
    }

    const data = toDbRow(draft, status, publishedAt)
    const existing = await prisma.geoPage.findUnique({ where: { slug: draft.slug } })

    if (existing) {
      if (existing.pageType === 'service_base') {
        console.warn(`[geo-seed-topics] skip service_base slug=${draft.slug}`)
        skipped += 1
        continue
      }
      await prisma.geoPage.update({ where: { id: existing.id }, data })
      updated += 1
      continue
    }

    await prisma.geoPage.create({
      data: { id: draft.id, ...data },
    })
    created += 1
  }

  console.log(
    `[geo-seed-topics] done total=${drafts.length} created=${created} updated=${updated} skipped=${skipped} publish=${PUBLISH}`
  )
}

main()
  .catch((e) => {
    console.error('[geo-seed-topics] failed', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
