/**
 * GEO-TOPIC-A04 · 运营专题 CRUD
 */
const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')
const { GEO_PAGE_STATUS } = require('../constants/geo-page-status')
const {
  mapGeoPageRow,
  mapGeoListItem,
  buildGeoPageWriteData,
  normalizeFaq,
  validateGeoFaqItems,
  buildGeoPageH5Path,
} = require('../schemas/geo-page.schema')
const { getGeoPageDetail } = require('./geo.service')
const { getGeoFaqTemplate } = require('../constants/geo-faq-templates')

function assertSlug(slug) {
  const value = String(slug || '').trim()
  if (!value) {
    const err = new Error('slug 不能为空')
    err.status = 400
    throw err
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    const err = new Error('slug 仅支持小写字母、数字与连字符')
    err.status = 400
    throw err
  }
  return value
}

async function listAdminGeoPages(query = {}) {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))
  const where = {}

  const status = String(query.status || '').trim()
  if (status) where.status = status

  const keyword = String(query.keyword || '').trim()
  if (keyword) {
    where.OR = [
      { title: { contains: keyword } },
      { slug: { contains: keyword } },
      { city: { contains: keyword } },
    ]
  }

  const [rows, total] = await Promise.all([
    prisma.geoPage.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.geoPage.count({ where }),
  ])

  return {
    list: rows.map((row) => mapGeoListItem(mapGeoPageRow(row))),
    total,
    page,
    pageSize,
  }
}

async function getAdminGeoPageDetail(idOrSlug) {
  const row = await prisma.geoPage.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
  })
  if (!row) {
    const err = new Error('专题不存在')
    err.status = 404
    throw err
  }
  return getGeoPageDetail(row.slug, { publicRead: false })
}

async function createAdminGeoPage(payload = {}) {
  const slug = assertSlug(payload.slug)
  const exists = await prisma.geoPage.findUnique({ where: { slug } })
  if (exists) {
    const err = new Error('slug 已存在')
    err.status = 409
    throw err
  }
  if (!String(payload.title || '').trim()) {
    const err = new Error('标题不能为空')
    err.status = 400
    throw err
  }

  const data = buildGeoPageWriteData(payload)
  const row = await prisma.geoPage.create({
    data: {
      id: newId('geop'),
      slug,
      title: data.title || String(payload.title).trim(),
      summary: data.summary ?? String(payload.summary || '').trim(),
      coverImage: data.coverImage ?? '',
      pageType: data.pageType || 'city_service',
      city: data.city ?? '',
      serviceId: data.serviceId ?? '',
      faultTag: data.faultTag ?? '',
      vehicleSeries: data.vehicleSeries ?? '',
      keywordsJson: data.keywordsJson ?? [],
      scenariosJson: data.scenariosJson ?? [],
      priceFactorsJson: data.priceFactorsJson ?? [],
      faqJson: data.faqJson ?? [],
      faqLinksJson: data.faqLinksJson ?? [],
      relatedCaseIdsJson: data.relatedCaseIdsJson ?? [],
      relatedStoreIdsJson: data.relatedStoreIdsJson ?? [],
      primaryStoreId: data.primaryStoreId ?? '',
      relatedServiceId: data.relatedServiceId ?? '',
      seoTitle: data.seoTitle ?? '',
      seoDescription: data.seoDescription ?? '',
      aiSummary: data.aiSummary ?? '',
      serviceMetaJson: data.serviceMetaJson ?? {},
      status: data.status || GEO_PAGE_STATUS.DRAFT,
    },
  })

  return getAdminGeoPageDetail(row.id)
}

async function updateAdminGeoPage(idOrSlug, payload = {}) {
  const row = await prisma.geoPage.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
  })
  if (!row) {
    const err = new Error('专题不存在')
    err.status = 404
    throw err
  }

  const data = buildGeoPageWriteData(payload, mapGeoPageRow(row))
  if (payload.slug != null) {
    const slug = assertSlug(payload.slug)
    if (slug !== row.slug) {
      const exists = await prisma.geoPage.findUnique({ where: { slug } })
      if (exists) {
        const err = new Error('slug 已存在')
        err.status = 409
        throw err
      }
      data.slug = slug
    }
  }

  await prisma.geoPage.update({
    where: { id: row.id },
    data: {
      ...data,
      keywordsJson: data.keywordsJson ?? row.keywordsJson,
      scenariosJson: data.scenariosJson ?? row.scenariosJson,
      priceFactorsJson: data.priceFactorsJson ?? row.priceFactorsJson,
      faqJson: data.faqJson ?? row.faqJson,
      faqLinksJson: data.faqLinksJson ?? row.faqLinksJson,
      serviceMetaJson: data.serviceMetaJson ?? row.serviceMetaJson,
      relatedCaseIdsJson: data.relatedCaseIdsJson ?? row.relatedCaseIdsJson,
      relatedStoreIdsJson: data.relatedStoreIdsJson ?? row.relatedStoreIdsJson,
    },
  })

  return getAdminGeoPageDetail(row.id)
}

async function setAdminGeoPageStatus(idOrSlug, status) {
  const nextStatus = String(status || '').trim()
  if (!Object.values(GEO_PAGE_STATUS).includes(nextStatus)) {
    const err = new Error('无效状态')
    err.status = 400
    throw err
  }

  const row = await prisma.geoPage.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
  })
  if (!row) {
    const err = new Error('专题不存在')
    err.status = 404
    throw err
  }

  if (nextStatus === GEO_PAGE_STATUS.PUBLISHED) {
    const page = mapGeoPageRow(row)
    const relatedCaseCount = Array.isArray(page.relatedCaseIds) ? page.relatedCaseIds.length : 0
    validateGeoFaqItems(page.faq || [], {
      requireStoreCheckHint: relatedCaseCount === 0,
      relatedCaseCount,
    })
  }

  const publishedAt =
    nextStatus === GEO_PAGE_STATUS.PUBLISHED
      ? row.publishedAt || new Date()
      : nextStatus === GEO_PAGE_STATUS.DRAFT
        ? null
        : row.publishedAt

  await prisma.geoPage.update({
    where: { id: row.id },
    data: { status: nextStatus, publishedAt },
  })

  return getAdminGeoPageDetail(row.id)
}

module.exports = {
  listAdminGeoPages,
  getAdminGeoPageDetail,
  createAdminGeoPage,
  updateAdminGeoPage,
  setAdminGeoPageStatus,
  getGeoFaqTemplate,
}
