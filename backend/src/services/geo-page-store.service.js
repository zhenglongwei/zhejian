/**
 * GEO 专题 · DB 读层（无 content.service 依赖，避免循环引用）
 */
const { prisma } = require('../lib/prisma')
const { GEO_PAGE_STATUS } = require('../constants/geo-page-status')
const { mapGeoPageRow, mapGeoListItem } = require('../schemas/geo-page.schema')
const { includesKeyword, normalizeKeyword } = require('../utils/search-match')

const PUBLIC_VISIBLE_STATUSES = [GEO_PAGE_STATUS.PUBLISHED, GEO_PAGE_STATUS.NOINDEX]

async function resolveGeoPageRef(ref) {
  const normalized = String(ref || '').trim()
  if (!normalized) return null
  const row = await prisma.geoPage.findFirst({
    where: {
      OR: [{ slug: normalized }, { id: normalized }],
    },
  })
  return row ? mapGeoPageRow(row) : null
}

async function listGeoPages(query = {}) {
  const limit = query.limit != null ? parseInt(String(query.limit), 10) : 0
  const statusFilter = query.status
    ? String(query.status).trim()
    : PUBLIC_VISIBLE_STATUSES

  const where = Array.isArray(statusFilter)
    ? { status: { in: statusFilter } }
    : { status: statusFilter }

  const rows = await prisma.geoPage.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }],
    ...(limit > 0 ? { take: limit } : {}),
  })

  const mapped = rows.map((row) => mapGeoPageRow(row))
  const list = mapped.map((page) => mapGeoListItem(page))
  const total = await prisma.geoPage.count({ where })
  return { list, total, pages: mapped }
}

async function searchPublishedGeoPages(keyword) {
  const k = normalizeKeyword(keyword)
  if (!k) return []
  const { list } = await listGeoPages({ limit: 0 })
  return list.filter((page) => {
    const haystack = [page.title, page.summary, ...(page.keywords || [])].join(' ')
    return includesKeyword(haystack, k)
  })
}

module.exports = {
  PUBLIC_VISIBLE_STATUSES,
  resolveGeoPageRef,
  listGeoPages,
  searchPublishedGeoPages,
}
