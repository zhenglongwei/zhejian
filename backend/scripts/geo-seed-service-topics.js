/**
 * GEO-TOPIC · 将 H5 服务目录（原 /service/）导入 geo_pages 为 service_base 专题
 *
 * 用法：
 *   node scripts/geo-seed-service-topics.js
 *   node scripts/geo-seed-service-topics.js --publish
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { H5_SERVICE_ITEMS } = require('../src/constants/h5-service-items')
const { GEO_PAGE_STATUS } = require('../src/constants/geo-page-status')
const { normalizeFaq, normalizeServiceMeta } = require('../src/schemas/geo-page.schema')

const prisma = new PrismaClient()
const PUBLISH = process.argv.includes('--publish')

async function main() {
  let created = 0
  let updated = 0

  for (const item of H5_SERVICE_ITEMS) {
    const slug = item.slug
    const status = PUBLISH ? GEO_PAGE_STATUS.PUBLISHED : GEO_PAGE_STATUS.DRAFT
    const publishedAt = PUBLISH ? new Date() : null
    const serviceMeta = normalizeServiceMeta({
      serviceItemId: item.serviceItemId,
      displayName: item.name,
      priceMode: item.priceMode,
      referencePriceHint: item.referencePriceHint,
      process: item.process,
      relatedSlugs: item.relatedSlugs,
    })

    const data = {
      slug,
      title: `${item.name}价格参考与维修案例`,
      summary: item.summary || '',
      coverImage: '',
      pageType: 'service_base',
      city: '',
      serviceId: item.serviceItemId,
      faultTag: '',
      vehicleSeries: '',
      keywordsJson: [item.name],
      scenariosJson: item.scenarios || [],
      priceFactorsJson: item.priceFactors || [],
      faqJson: normalizeFaq(item.faq || []),
      faqLinksJson: [],
      relatedCaseIdsJson: [],
      relatedStoreIdsJson: [],
      primaryStoreId: '',
      relatedServiceId: item.serviceItemId,
      seoTitle: `${item.name}价格参考与维修案例_透明汽车维修平台 · 辙见`,
      seoDescription: `了解${item.name}适用情况、维修流程、参考价格、价格影响因素和真实维修案例，可预约本地辙见门店。`,
      aiSummary: item.summary || '',
      serviceMetaJson: serviceMeta,
      status,
      publishedAt,
    }

    const existing = await prisma.geoPage.findUnique({ where: { slug } })
    if (existing) {
      await prisma.geoPage.update({ where: { id: existing.id }, data })
      updated += 1
    } else {
      await prisma.geoPage.create({
        data: { id: `geop_svc_${slug}`, ...data },
      })
      created += 1
    }
  }

  console.log(
    `[geo-seed-service] done created=${created} updated=${updated} publish=${PUBLISH}`
  )
}

main()
  .catch((e) => {
    console.error('[geo-seed-service] failed', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
