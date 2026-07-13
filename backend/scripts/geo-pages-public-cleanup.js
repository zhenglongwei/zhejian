/**
 * GEO 公开站清理：回填 serviceMeta、删除不可映射遗留专题
 *
 * 用法：
 *   node scripts/geo-pages-public-cleanup.js
 *   node scripts/geo-pages-public-cleanup.js --dry-run
 */
require('dotenv').config()
const { prisma } = require('../src/lib/prisma')
const { GEO_TOPIC_SEED_ALL } = require('../src/constants/geo-topic-seed-list')
const { normalizeServiceMeta } = require('../src/schemas/geo-page.schema')
const { mapGeoPageRow } = require('../src/schemas/geo-page.schema')
const {
  buildGeoPageServicePath,
  isPublicDiscoverableGeoPage,
} = require('../src/utils/geo-page-service-resolve')
const { resolveH5ServiceItemById } = require('../src/constants/h5-service-items')

const DRY_RUN = process.argv.includes('--dry-run')
const seedBySlug = new Map(GEO_TOPIC_SEED_ALL.map((seed) => [seed.slug, seed]))

function buildServiceMetaPatch(seed) {
  const item = resolveH5ServiceItemById(seed.serviceItemId)
  if (!item) return null
  return normalizeServiceMeta({
    serviceItemId: item.serviceItemId,
    displayName: item.name,
    priceMode: item.priceMode,
    referencePriceHint: item.referencePriceHint,
    process: item.process,
    relatedSlugs: item.relatedSlugs,
  })
}

function shouldDeleteLegacyPage(page, merged) {
  if (seedBySlug.has(page.slug)) return false
  if (page.pageType === 'service_base') return false
  return !isPublicDiscoverableGeoPage({ ...merged, status: page.status })
}

async function main() {
  const rows = await prisma.geoPage.findMany()

  let metaPatched = 0
  let serviceIdPatched = 0
  let deleted = 0
  const deletedSlugs = []

  for (const row of rows) {
    const page = mapGeoPageRow(row)
    const seed = seedBySlug.get(page.slug)
    const data = {}

    if (seed) {
      const meta = buildServiceMetaPatch(seed)
      if (meta) {
        const prev = page.serviceMeta || {}
        if (prev.serviceItemId !== meta.serviceItemId) {
          data.serviceMetaJson = { ...prev, ...meta }
          metaPatched += 1
        }
        if (page.serviceId !== seed.serviceItemId) {
          data.serviceId = seed.serviceItemId
          data.relatedServiceId = seed.serviceItemId
          serviceIdPatched += 1
        }
      }
    }

    const merged = data.serviceMetaJson
      ? { ...page, serviceMeta: data.serviceMetaJson, serviceId: data.serviceId || page.serviceId }
      : page

    if (shouldDeleteLegacyPage(page, merged)) {
      deleted += 1
      deletedSlugs.push({
        slug: page.slug,
        pageType: page.pageType,
        status: page.status,
        path: buildGeoPageServicePath(merged) || '(none)',
      })
      if (!DRY_RUN) {
        await prisma.geoPage.delete({ where: { id: row.id } })
      }
      continue
    }

    if (!Object.keys(data).length) continue

    if (!DRY_RUN) {
      await prisma.geoPage.update({ where: { id: row.id }, data })
    }
  }

  console.log('[geo-pages-public-cleanup] done', {
    dryRun: DRY_RUN,
    scanned: rows.length,
    metaPatched,
    serviceIdPatched,
    deleted,
    deletedSample: deletedSlugs.slice(0, 20),
  })
}

main()
  .catch((error) => {
    console.error('[geo-pages-public-cleanup] ❌', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
