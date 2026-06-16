/**
 * GEO-TOPIC-A06 · 将 mock/geo-pages 种子导入 geo_pages 表
 *
 * 用法：
 *   node scripts/geo-pages-migrate-from-mock.js
 *   node scripts/geo-pages-migrate-from-mock.js --publish
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { GEO_PAGES } = require('../../mock/geo-pages')
const { GEO_PAGE_STATUS } = require('../src/constants/geo-page-status')
const { normalizeFaq } = require('../src/schemas/geo-page.schema')

const prisma = new PrismaClient()
const PUBLISH = process.argv.includes('--publish')

function parseDate(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

async function main() {
  let created = 0
  let updated = 0

  for (const page of GEO_PAGES) {
    const slug = page.slug || page.id
    const status = PUBLISH ? GEO_PAGE_STATUS.PUBLISHED : GEO_PAGE_STATUS.DRAFT
    const publishedAt = PUBLISH ? parseDate(page.updatedAt) || new Date() : null

    const data = {
      slug,
      title: page.title || '',
      summary: page.summary || '',
      coverImage: page.coverImage || '',
      pageType: page.pageType || 'city_service',
      city: page.city || '',
      serviceId: page.relatedServiceId || '',
      faultTag: '',
      vehicleSeries: '',
      keywordsJson: page.keywords || [],
      scenariosJson: page.scenarios || [],
      priceFactorsJson: page.priceFactors || [],
      faqJson: normalizeFaq(page.faq || []),
      faqLinksJson: [],
      relatedCaseIdsJson: page.relatedCaseIds || [],
      relatedStoreIdsJson: page.relatedStoreIds || [],
      primaryStoreId: page.primaryStoreId || '',
      relatedServiceId: page.relatedServiceId || '',
      seoTitle: '',
      seoDescription: '',
      aiSummary: page.summary || '',
      status,
      publishedAt,
    }

    const existing = await prisma.geoPage.findFirst({
      where: { OR: [{ id: page.id }, { slug }] },
    })

    if (existing) {
      await prisma.geoPage.update({
        where: { id: existing.id },
        data,
      })
      updated += 1
    } else {
      await prisma.geoPage.create({
        data: { id: page.id, ...data },
      })
      created += 1
    }
  }

  console.log(
    `[geo-migrate] done created=${created} updated=${updated} publish=${PUBLISH}`
  )
}

main()
  .catch((e) => {
    console.error('[geo-migrate] failed', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
