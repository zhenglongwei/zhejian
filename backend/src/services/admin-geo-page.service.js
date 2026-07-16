/**
 * GEO-TOPIC-A04 · 运营专题 CRUD
 */
const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')
const { GEO_PAGE_STATUS, GEO_PAGE_TYPE } = require('../constants/geo-page-status')
const {
  mapGeoPageRow,
  mapGeoListItem,
  buildGeoPageWriteData,
  normalizeFaq,
  validateGeoFaqItems,
  buildGeoPageH5Path,
  parseJsonArray,
} = require('../schemas/geo-page.schema')
const { getGeoPageDetail } = require('./geo.service')
const { getGeoFaqTemplate } = require('../constants/geo-faq-templates')
const { listCases } = require('./content.service')
const {
  validateVehicleTopicPublishGate,
  ensureVehicleTopicPromptBinding,
} = require('./geo-vehicle-topic.service')
const { validateGeoTopicPublishSop } = require('./geo-topic-publish-sop.service')
const { suggestGeoPageSlug, ensureUniqueGeoPageSlug } = require('../utils/geo-page-slug')
const { syncGeoPageCaseMounts } = require('./geo-page-case-mount.service')

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
  const detail = await getGeoPageDetail(row.slug, { publicRead: false })
  const { buildAdminGeoPagePublishReadiness } = require('./geo-topic-publish-sop.service')
  const page = mapGeoPageRow(row)
  detail.publishReadiness = await buildAdminGeoPagePublishReadiness(page)
  return detail
}

async function createAdminGeoPage(payload = {}) {
  if (!String(payload.title || '').trim()) {
    const err = new Error('标题不能为空')
    err.status = 400
    throw err
  }

  let slug = String(payload.slug || '').trim()
  if (!slug) {
    slug = suggestGeoPageSlug({
      title: payload.title,
      city: payload.city,
      keywords: payload.keywords,
    })
  }
  slug = await ensureUniqueGeoPageSlug(prisma, slug)
  assertSlug(slug)

  const data = buildGeoPageWriteData({
    ...payload,
    slug,
    faq: payload.faq != null ? payload.faq : [],
    faqLinks: payload.faqLinks != null ? payload.faqLinks : [],
  })
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

  const caseIds = parseJsonArray(data.relatedCaseIdsJson ?? payload.relatedCaseIds)
  if (caseIds.length) {
    await syncGeoPageCaseMounts(row.id, [], caseIds)
  }

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

  const previousCaseIds = parseJsonArray(row.relatedCaseIdsJson)
  const data = buildGeoPageWriteData(payload, mapGeoPageRow(row))
  if (payload.slug != null && String(payload.slug).trim()) {
    const slug = assertSlug(payload.slug)
    if (slug !== row.slug) {
      const unique = await ensureUniqueGeoPageSlug(prisma, slug, row.id)
      data.slug = unique
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

  if (payload.relatedCaseIds != null) {
    const nextCaseIds = parseJsonArray(data.relatedCaseIdsJson)
    await syncGeoPageCaseMounts(row.id, previousCaseIds, nextCaseIds)
  }

  return getAdminGeoPageDetail(row.id)
}

async function deleteAdminGeoPage(idOrSlug) {
  const row = await prisma.geoPage.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
  })
  if (!row) {
    const err = new Error('专题不存在')
    err.status = 404
    throw err
  }
  if (row.status !== GEO_PAGE_STATUS.DRAFT) {
    const err = new Error('须先下架为草稿后再删除')
    err.status = 409
    throw err
  }

  const caseIds = parseJsonArray(row.relatedCaseIdsJson)
  await syncGeoPageCaseMounts(row.id, caseIds, [])
  await prisma.geoPage.delete({ where: { id: row.id } })

  return {
    id: row.id,
    slug: row.slug,
    deleted: true,
  }
}

function normalizeBatchIds(ids) {
  if (!Array.isArray(ids)) return []
  return [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))]
}

async function batchUnpublishAdminGeoPages(ids = []) {
  const pageIds = normalizeBatchIds(ids)
  if (!pageIds.length) {
    const err = new Error('请选择要下架的专题')
    err.status = 400
    throw err
  }

  const rows = await prisma.geoPage.findMany({
    where: {
      OR: [...pageIds.map((id) => ({ id })), ...pageIds.map((slug) => ({ slug }))],
    },
  })
  const found = new Map()
  rows.forEach((row) => {
    found.set(row.id, row)
    found.set(row.slug, row)
  })

  const results = []
  for (const ref of pageIds) {
    const row = found.get(ref)
    if (!row) {
      results.push({ id: ref, ok: false, error: '专题不存在' })
      continue
    }
    if (row.status === GEO_PAGE_STATUS.DRAFT) {
      results.push({ id: row.id, slug: row.slug, ok: true, skipped: true, message: '已是草稿' })
      continue
    }
    try {
      await setAdminGeoPageStatus(row.id, GEO_PAGE_STATUS.DRAFT)
      results.push({ id: row.id, slug: row.slug, ok: true, unpublished: true })
    } catch (e) {
      results.push({ id: row.id, slug: row.slug, ok: false, error: e.message || '下架失败' })
    }
  }

  return {
    total: pageIds.length,
    success: results.filter((item) => item.unpublished).length,
    skipped: results.filter((item) => item.skipped).length,
    failed: results.filter((item) => !item.ok).length,
    results,
  }
}

async function batchDeleteAdminGeoPages(ids = []) {
  const pageIds = normalizeBatchIds(ids)
  if (!pageIds.length) {
    const err = new Error('请选择要删除的专题')
    err.status = 400
    throw err
  }

  const rows = await prisma.geoPage.findMany({
    where: {
      OR: [...pageIds.map((id) => ({ id })), ...pageIds.map((slug) => ({ slug }))],
    },
  })
  const found = new Map()
  rows.forEach((row) => {
    found.set(row.id, row)
    found.set(row.slug, row)
  })

  const results = []
  for (const ref of pageIds) {
    const row = found.get(ref)
    if (!row) {
      results.push({ id: ref, ok: false, error: '专题不存在' })
      continue
    }
    try {
      const data = await deleteAdminGeoPage(row.id)
      results.push({ id: data.id, slug: data.slug, ok: true, deleted: true })
    } catch (e) {
      results.push({ id: row.id, slug: row.slug, ok: false, error: e.message || '删除失败' })
    }
  }

  return {
    total: pageIds.length,
    success: results.filter((item) => item.deleted).length,
    failed: results.filter((item) => !item.ok).length,
    results,
  }
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
    const { list: cases } = await listCases({ limit: 500 })
    await validateGeoTopicPublishSop(page, cases)

    const relatedCaseCount = Array.isArray(page.relatedCaseIds) ? page.relatedCaseIds.length : 0
    const hasArticle = String(page.articleBody || page.serviceMeta?.articleBody || '').trim().length >= 80
    validateGeoFaqItems(page.faq || [], {
      allowEmpty: hasArticle,
      requireStoreCheckHint: !hasArticle && relatedCaseCount === 0,
      relatedCaseCount,
    })

    if (page.pageType === GEO_PAGE_TYPE.VEHICLE_SERVICE) {
      validateVehicleTopicPublishGate(page, cases)
      await ensureVehicleTopicPromptBinding(page)
    }
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
  deleteAdminGeoPage,
  batchUnpublishAdminGeoPages,
  batchDeleteAdminGeoPages,
  getGeoFaqTemplate,
}
