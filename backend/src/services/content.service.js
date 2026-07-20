const { prisma } = require('../lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { resolvePublicCaseMediaUrl } = require('../lib/media-url')
const { resolveClientReadableMediaUrl, resolveClientReadableMediaUrls, rewriteMediaUrlForCurrentBase } = require('../lib/media-storage')
const { buildPublicCasePrice, resolvePublicCasePriceFields } = require('../utils/album-price')
const { prepareSearchLists, parseSearchCoords, packSearchResults } = require('../utils/search-query')
const {
  matchSearchService,
  matchSearchMerchant,
  matchSearchCase,
} = require('../utils/search-match')
const {
  partitionCaseFaq,
  hasCaseFaqContent,
} = require('../utils/case-faq-links')
const { CASE_ARTICLE_H5_PUBLISHED_STATUSES } = require('../constants/case-article-status')
const { listPublicReviewsForAlbum } = require('./album-review.service')
const { getServiceItem } = require('../constants/service-catalog')
const {
  SEED_SERVICES,
  STORE_EXTRAS,
  SEARCH_HOTWORDS,
  SERVICE_ITEM_NAME_MAP,
  FALLBACK_PUBLIC_CASES,
} = require('../constants/content-seed')
const {
  PLAN_SALE_STATUS,
  isPubliclyVisible,
} = require('../constants/service-plan')
const { formatPlanRecord } = require('./service-plan-format')
const { resolveRelatedCasesForService, matchServiceName } = require('../utils/service-case-link')
const { resolveRelatedCasesForCase } = require('../utils/case-related-cases')
const { buildCaseInternalLinks, resolveServiceItemId } = require('../utils/case-internal-links')
const {
  filterPublicSpecialties,
  filterPublicEnvironmentImages,
} = require('../utils/store-public-display')
const { searchPublishedGeoPages, listGeoPages } = require('./geo-page-store.service')
const {
  resolvePublicCaseContentNodes,
  extractPublicViewFromContentJson,
  extractSnapshotFromContentJson,
} = require('../schemas/case-snapshot.schema')
const { resolveCaseMileageKm } = require('./geo-case-aggregate.service')
const {
  applySnapshotLayerToPublicCase,
  buildCasePublicLayerMeta,
} = require('../utils/case-public-layers')
const {
  resolveGeoReadableFields,
  mapCaseArticleForApi,
  mapCaseSeoForApi,
  emptyCaseArticleApi,
  emptyCaseSeoApi,
} = require('../schemas/case-geo-content.schema')
const {
  enrichStorePublicPage,
  enrichCasePublicPage,
  enrichServicePublicPage,
} = require('./public-page-enrich.service')
const { applyCasePublicDisplay } = require('../utils/case-geo-display')
const { buildCasePageSchemaGraph } = require('../lib/schema-graph')
const { config } = require('../config')
const { H5_SERVICE_ITEMS } = require('../constants/h5-service-items')
const { resolveStoreBusinessStatus } = require('../utils/store-business-status')
const {
  buildPublicCapabilityView,
  readCapabilityJson,
  computeStoreListScorePenalty,
  collectApprovedEquipmentImageUrls,
} = require('../utils/store-capability')
const { buildQualificationTags } = require('../lib/onboarding-payload')

const STORE_STATUS_MAP = {
  ACTIVE: 'open',
  DRAFT: 'offline',
}

async function resolveActivePublicStoreIds(storeIds) {
  const ids = [...new Set((storeIds || []).filter(Boolean))]
  if (!ids.length) return new Set()
  const stores = await prisma.store.findMany({
    where: {
      id: { in: ids },
      status: 'ACTIVE',
      merchant: { status: 'ACTIVE' },
    },
    select: { id: true },
  })
  return new Set(stores.map((s) => s.id))
}

async function isPublicCaseStoreVisible(storeId) {
  if (!storeId) return false
  const active = await resolveActivePublicStoreIds([storeId])
  return active.has(storeId)
}

function shouldShowStorePublicly(tier) {
  return tier !== 'anonymous'
}

function normalizeKeyword(keyword) {
  return String(keyword || '').trim()
}

function includesKeyword(text, keyword) {
  if (!keyword) return true
  return String(text || '')
    .toLowerCase()
    .includes(keyword.toLowerCase())
}

function matchRecord(record, keyword, fields) {
  const k = normalizeKeyword(keyword)
  if (!k) return true
  return fields.some((field) => includesKeyword(record[field], k))
}

function formatPublishedAt(value) {
  if (!value) return ''
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  return String(value).slice(0, 10)
}

function sanitizeCover(url) {
  const cover = resolvePublicCaseMediaUrl(url) || ''
  return cover ? rewriteMediaUrlForCurrentBase(cover) : ''
}

function dedupeUrls(urls) {
  const seen = new Set()
  return (urls || []).filter((url) => {
    const key = String(url || '').trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function collectNodeImageUrls(node) {
  const urls = []
  ;(node.imagesDesensitized || []).forEach((img) => {
    if (typeof img === 'string') urls.push(img)
  })
  ;(node.images || []).forEach((img) => {
    if (typeof img === 'string') urls.push(img)
    else if (img) {
      urls.push(img.maskedUrl, img.preMaskedUrl)
    }
  })
  return dedupeUrls(urls.filter(Boolean))
}

function pickCoverFromAlbum() {
  return ''
}

function pickCaseCover(row, content, album) {
  const direct = sanitizeCover(row.coverImage)
  if (direct) return direct

  for (const node of content.nodes || []) {
    for (const url of collectNodeImageUrls(node)) {
      const cover = sanitizeCover(url)
      if (cover) return cover
    }
  }

  return pickCoverFromAlbum(album)
}

function applyPublicDisplayRules(item) {
  if (!item) return item
  const hasUserAuth =
    item.authorizationTier === 'anonymous' || item.authorizationTier === 'named'
  const publicPrice = buildPublicCasePrice(item, { hasUserAuthorization: hasUserAuth })
  const next = {
    ...item,
    priceMode: publicPrice.priceMode,
    amount: publicPrice.amount,
    minAmount: publicPrice.minAmount,
    maxAmount: publicPrice.maxAmount,
    planAmount: publicPrice.planAmount,
  }
  if (!shouldShowStorePublicly(item.authorizationTier)) {
    return applyCasePublicDisplay({ ...next, storeName: '' })
  }
  return applyCasePublicDisplay(next)
}

function sanitizeNodes(nodes) {
  return (nodes || []).map((node) => ({
    id: node.id || node.nodeId || '',
    title: node.title || '',
    note: node.note || '',
    images: collectNodeImageUrls(node)
      .map((url) => sanitizeCover(url))
      .filter(Boolean),
  }))
}

function mapPublicCaseRow(row, album) {
  const rawContent = row.contentJson && typeof row.contentJson === 'object' ? row.contentJson : {}
  const content = {
    ...rawContent,
    nodes: resolvePublicCaseContentNodes(rawContent),
  }
  const geoFields = resolveGeoReadableFields(row)
  const publicView = extractPublicViewFromContentJson(rawContent)
  const viewFacts = publicView?.facts || {}
  const cover = pickCaseCover(row, content, album)
  const publicPrice = resolvePublicCasePriceFields(row, album)
  const item = {
    id: row.id,
    albumId: row.albumId,
    authorizationTier: row.authorizationTier || 'named',
    coverImage: cover,
    coverImageDesensitized: cover,
    title: row.title || '',
    vehicleText: content.vehicleText || '',
    serviceName: row.serviceName || '',
    summary: row.summary || '',
    priceMode: publicPrice.priceMode,
    amount: publicPrice.amount,
    planAmount: publicPrice.planAmount,
    minAmount: publicPrice.minAmount,
    maxAmount: publicPrice.maxAmount,
    storeId: row.storeId || '',
    storeName: row.storeName || '',
    city: row.city || '杭州',
    viewCount: 0,
    publishedAt: formatPublishedAt(row.publishedAt),
    tags: content.tags || ['authorized', 'desensitized', 'audited'],
    aiSummary: geoFields.aiSummary,
    keyInfo: geoFields.keyInfo.length ? geoFields.keyInfo : content.keyInfo || [],
    faultDesc: viewFacts.faultDesc || geoFields.faultDesc,
    inspectResult: viewFacts.inspectResult || geoFields.inspectResult,
    repairPlan: viewFacts.repairPlan || geoFields.repairPlan,
    resultConfirm: viewFacts.resultConfirm || geoFields.resultConfirm,
    priceFactors:
      geoFields.priceFactors.length > 0 ? geoFields.priceFactors : content.priceFactors || [],
    nodes: sanitizeNodes(content.nodes),
    faq: geoFields.faq || [],
    faqLinks: geoFields.faqLinks || [],
    slug: geoFields.slug || null,
    seoNoindex: Boolean(row.seoNoindex),
    trustMeta: geoFields.trustMeta || null,
    ...buildCasePublicLayerMeta(row),
  }
  const layered = applySnapshotLayerToPublicCase(row, item)
  const snapshot = extractSnapshotFromContentJson(rawContent)
  layered.vehicleMileage = snapshot?.vehicle?.mileage ?? null
  layered.mileageKm = resolveCaseMileageKm(layered)
  return applyPublicDisplayRules(layered)
}

function mapFallbackCase(item) {
  const mapped = applyPublicDisplayRules({
    ...item,
    coverImage: sanitizeCover(item.coverImage),
    coverImageDesensitized: sanitizeCover(item.coverImage),
    nodes: sanitizeNodes(item.nodes),
  })
  return {
    ...mapped,
    seo: emptyCaseSeoApi(item.id),
    article: emptyCaseArticleApi(),
  }
}

function attachCaseArticleAndSeo(row, item) {
  const sourceRow = row || {}
  const geoFields = resolveGeoReadableFields(sourceRow)
  const seo = mapCaseSeoForApi(sourceRow)
  const article = mapCaseArticleForApi(sourceRow)
  const layerMeta = buildCasePublicLayerMeta(sourceRow)
  return {
    ...item,
    ...layerMeta,
    seoTitle: seo.title || item.title || '',
    seoDescription: seo.description || item.summary || '',
    seoNoindex: seo.noindex,
    canonicalPath: seo.canonicalPath,
    slug: seo.slug,
    articleStatus: article.status,
    articleBody: article.body,
    seo,
    article,
    enrichment: {
      version: layerMeta.enrichmentVersion,
      aiSummary: geoFields.aiSummary,
      faq: geoFields.faq || [],
      faqLinks: geoFields.faqLinks || [],
      keyInfo: geoFields.keyInfo || [],
      sections: geoFields.sections || [],
      nodeNarratives: geoFields.nodeNarratives || [],
      seoTitle: geoFields.seoTitle,
      seoDescription: geoFields.seoDescription,
      trustMeta: geoFields.trustMeta || null,
    },
    trustMeta: geoFields.trustMeta || null,
  }
}

async function fetchPublicCaseRows() {
  const rows = await prisma.publicCase.findMany({
    where: {
      status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
      articleStatus: { in: CASE_ARTICLE_H5_PUBLISHED_STATUSES },
    },
    orderBy: { publishedAt: 'desc' },
  })
  if (!rows.length) return FALLBACK_PUBLIC_CASES.map(mapFallbackCase)

  const storeIds = [...new Set(rows.map((row) => row.storeId).filter(Boolean))]
  const activeStoreIds = await resolveActivePublicStoreIds(storeIds)
  const visibleRows = rows.filter((row) => row.storeId && activeStoreIds.has(row.storeId))
  if (!visibleRows.length) return []

  return visibleRows.map((row) => mapPublicCaseRow(row, null))
}

async function listCases(query = {}) {
  let list = await fetchPublicCaseRows()

  if (query.authorizationTier) {
    const tier = String(query.authorizationTier)
    if (tier !== 'all' && tier !== 'undefined') {
      list = list.filter((c) => c.authorizationTier === tier)
    }
  }
  if (query.storeId) {
    list = list.filter((c) => c.storeId === query.storeId)
  }
  if (query.serviceItemId) {
    const catalogItem = getServiceItem(query.serviceItemId)
    const itemName = catalogItem?.name || SERVICE_ITEM_NAME_MAP[query.serviceItemId] || ''
    if (itemName) {
      list = list.filter((c) => matchServiceName(c.serviceName, itemName))
    }
  }
  if (query.city) {
    const city = String(query.city).trim()
    if (city) list = list.filter((c) => c.city === city)
  }
  if (query.serviceType) {
    list = list.filter(
      (c) => c.serviceName && c.serviceName.indexOf(query.serviceType) !== -1
    )
  }
  if (query.serviceName) {
    const serviceName = String(query.serviceName).trim()
    if (serviceName) {
      list = list.filter((c) => matchServiceName(c.serviceName, serviceName))
    }
  }

  const total = list.length
  const page =
    query.page != null ? Math.max(1, parseInt(String(query.page), 10) || 1) : null
  const pageSizeRaw =
    query.pageSize != null ? parseInt(String(query.pageSize), 10) : null
  const limit = query.limit != null ? parseInt(String(query.limit), 10) : 0

  if (page != null && pageSizeRaw != null && pageSizeRaw > 0) {
    const pageSize = Math.min(pageSizeRaw, 50)
    const offset = (page - 1) * pageSize
    list = list.slice(offset, offset + pageSize)
    return { list, total, page, pageSize, hasMore: offset + list.length < total }
  }

  if (limit > 0) {
    list = list.slice(0, limit)
  }

  return { list, total }
}

async function getCaseDetail(idOrSlug) {
  let row = await prisma.publicCase.findFirst({
    where: {
      id: idOrSlug,
      status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
      articleStatus: { in: CASE_ARTICLE_H5_PUBLISHED_STATUSES },
    },
  })
  if (!row) {
    row = await prisma.publicCase.findFirst({
      where: {
        slug: idOrSlug,
        status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
        articleStatus: { in: CASE_ARTICLE_H5_PUBLISHED_STATUSES },
      },
    })
  }

  let item
  let album = null
  if (row) {
    const storeVisible = await isPublicCaseStoreVisible(row.storeId)
    if (!storeVisible) {
      const err = new Error('案例不存在')
      err.status = 404
      throw err
    }
    album = row.albumId
      ? await prisma.album.findUnique({
          where: { id: row.albumId },
          include: {
            nodes: { orderBy: { sortOrder: 'asc' } },
            images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
          },
        })
      : null
    item = attachCaseArticleAndSeo(row, mapPublicCaseRow(row, album))
  } else {
    const fallback = FALLBACK_PUBLIC_CASES.find(
      (c) => c.id === idOrSlug || c.slug === idOrSlug
    )
    if (!fallback) {
      const err = new Error('案例不存在')
      err.status = 404
      throw err
    }
    item = mapFallbackCase(fallback)
  }

  const serviceItemId = resolveServiceItemId(item, album)
  if (serviceItemId) item.serviceItemId = serviceItemId

  const { list: allCases } = await listCases({ limit: 200 })
  const { relatedCases, relatedCaseTier } = resolveRelatedCasesForCase(item, allCases, {
    limit: 3,
    serviceItemId,
  })

  let storePhone = ''
  let store = null
  if (item.storeId) {
    const storeRow = await prisma.store.findUnique({ where: { id: item.storeId } })
    if (storeRow) {
      storePhone = storeRow.phone || ''
      store = {
        id: storeRow.id,
        name: storeRow.name || '',
        address: storeRow.address || '',
        latitude: storeRow.latitude != null ? Number(storeRow.latitude) : null,
        longitude: storeRow.longitude != null ? Number(storeRow.longitude) : null,
        phone: storeRow.phone || '',
      }
    }
  }

  const faq = item.faq || []
  const faqLinks = item.faqLinks || []
  const ownerReviews =
    row && row.albumId ? await listPublicReviewsForAlbum(row.albumId) : []
  const display = applyPublicDisplayRules(item)
  const showStorePublicly = shouldShowStorePublicly(item.authorizationTier)
  const { pages: geoPagesForMatch } = await listGeoPages({ limit: 100 })
  const internalLinks = buildCaseInternalLinks(
    { ...display, serviceItemId },
    {
      album,
      showStorePublicly,
      hasFaq: hasCaseFaqContent([...(faq || []), ...(faqLinks || [])]),
      geoPages: geoPagesForMatch,
    }
  )

  const serviceSlug =
    H5_SERVICE_ITEMS.find((entry) => matchServiceName(display.serviceName, entry.name))?.slug || ''
  const schemaGraph = buildCasePageSchemaGraph({
    baseUrl: config.publicBaseUrl,
    showStorePublicly,
    serviceSlug,
    data: {
      ...display,
      faq,
      store,
      seo: item.seo,
      canonicalPath: item.seo?.canonicalPath || item.canonicalPath,
      trustMeta: item.trustMeta || item.enrichment?.trustMeta || null,
    },
    organizationSameAs: config.geo?.organizationSameAs || [],
  })

  return enrichCasePublicPage({
    ...display,
    trustMeta: item.trustMeta || item.enrichment?.trustMeta || null,
    serviceItemId,
    storePhone,
    store,
    showStorePublicly,
    faq,
    faqLinks,
    ownerReviews,
    relatedCases,
    relatedCaseTier,
    internalLinks,
    schemaGraph,
  })
}

function mapStoreRow(store, caseCount = 0) {
  const extras = STORE_EXTRAS[store.id] || {}
  const photos = store.photosJson && typeof store.photosJson === 'object' ? store.photosJson : {}
  const capability = readCapabilityJson(store.capabilityJson)
  const publicCapability = buildPublicCapabilityView(store.capabilityJson, photos)
  const businessStatus = resolveStoreBusinessStatus({
    storeStatus: store.status,
    businessHours: store.businessHours || extras.businessHours || '',
    bookingPaused: capability.bookingPaused,
  })
  const latitude =
    store.latitude != null ? store.latitude : extras.latitude != null ? extras.latitude : null
  const longitude =
    store.longitude != null
      ? store.longitude
      : extras.longitude != null
        ? extras.longitude
        : null
  const coverImage = resolveClientReadableMediaUrl(
    photos.facadeUrl || extras.coverImage || ''
  )
  const workshopUrls =
    Array.isArray(photos.workshopUrls) && photos.workshopUrls.length
      ? photos.workshopUrls
      : extras.environmentImages || []
  const equipmentImageUrls = collectApprovedEquipmentImageUrls(publicCapability)
  const environmentImages = filterPublicEnvironmentImages(
    resolveClientReadableMediaUrls([...workshopUrls, ...equipmentImageUrls])
  )
  const qualificationJson =
    store.merchant &&
    store.merchant.qualificationJson &&
    typeof store.merchant.qualificationJson === 'object'
      ? store.merchant.qualificationJson
      : {}
  const scorePenalty = computeStoreListScorePenalty({
    brandAuthValidUntil: capability.brandAuthValidUntil,
    qualificationValidUntil: String(qualificationJson.validUntil || '').trim(),
  })
  const baseScore = Number(extras.score) || 0
  const qualificationTagsFromJson = buildQualificationTags(qualificationJson)
  const qualificationTags =
    qualificationTagsFromJson.length > 0
      ? qualificationTagsFromJson
      : extras.qualificationTags || []
  return {
    id: store.id,
    merchantId: store.merchantId || '',
    name: store.name || '',
    status: businessStatus,
    businessStatus,
    auditStatus: extras.auditStatus || 'approved',
    address: store.address || '',
    latitude,
    longitude,
    businessHours: store.businessHours || extras.businessHours || '',
    phone: store.phone || '',
    intro: store.intro || extras.aiSummary || '',
    qualificationTags,
    specialties: filterPublicSpecialties(
      Array.isArray(store.servicesJson) ? store.servicesJson : extras.specialties || []
    ),
    specialtyBrands: publicCapability.specialtyBrands,
    notAccepting: publicCapability.notAccepting,
    equipmentTags: publicCapability.equipmentTags,
    brandAuth: publicCapability.brandAuth,
    score: Math.max(0, baseScore - scorePenalty),
    caseCount,
    supportsAlbum: extras.supportsAlbum !== false,
    coverImage,
    environmentImages,
    certifications: extras.certifications || [],
    aiSummary: store.intro || extras.aiSummary || '',
    freshness: {
      lastProfileVerifiedAt: publicCapability.lastProfileVerifiedAt || '',
      summary: '',
    },
  }
}

async function countCasesByStore(storeId) {
  const count = await prisma.publicCase.count({
    where: {
      storeId,
      status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
      articleStatus: { in: CASE_ARTICLE_H5_PUBLISHED_STATUSES },
    },
  })
  if (count > 0) return count
  return FALLBACK_PUBLIC_CASES.filter((c) => c.storeId === storeId).length
}

async function listActiveStores() {
  return prisma.store.findMany({
    where: { status: 'ACTIVE' },
    include: {
      merchant: { select: { qualificationJson: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
}

async function listMerchants(query = {}) {
  const stores = await listActiveStores()
  const mapped = await Promise.all(
    stores.map(async (store) => {
      const caseCount = await countCasesByStore(store.id)
      return mapStoreRow(store, caseCount)
    })
  )

  let list = mapped.filter((s) => s.status !== 'offline')
  if (query.status) {
    list = list.filter((s) => s.status === query.status)
  }

  list.sort((a, b) => {
    const scoreDiff = (b.score || 0) - (a.score || 0)
    if (scoreDiff !== 0) return scoreDiff
    return (b.caseCount || 0) - (a.caseCount || 0)
  })

  const total = list.length
  const limit = query.limit != null ? parseInt(String(query.limit), 10) : 0
  if (limit > 0) {
    list = list.slice(0, limit)
  }

  return { list, total }
}

async function getMerchantDetail(id) {
  const store = await prisma.store.findUnique({
    where: { id },
    include: { merchant: true },
  })
  if (!store) {
    const err = new Error('门店不存在')
    err.status = 404
    throw err
  }

  const mapped = mapStoreRow(store, await countCasesByStore(store.id))
  if (mapped.status === 'offline') {
    const err = new Error('该门店暂不可查看')
    err.status = 410
    throw err
  }
  const onlinePlans = await prisma.merchantServicePlan.findMany({
    where: { storeId: store.id, saleStatus: 'ONLINE' },
    take: 8,
    select: { name: true, serviceItemId: true },
    orderBy: { updatedAt: 'desc' },
  })
  const serviceNames = onlinePlans
    .map((plan) => {
      if (plan.name) return plan.name
      const item = getServiceItem(plan.serviceItemId)
      return item?.name || ''
    })
    .filter(Boolean)
  return enrichStorePublicPage(mapped, store, store.merchant, {
    serviceCount: onlinePlans.length,
    serviceNames,
  })
}

function listPublishedServices(query = {}) {
  let list = SEED_SERVICES.filter((s) => s.status === 'published')

  if (query.storeId) {
    list = list.filter((s) => s.storeId === query.storeId)
  }
  if (query.categoryId) {
    const categoryId = String(query.categoryId)
    if (categoryId !== 'all' && categoryId !== 'undefined') {
      list = list.filter((s) => s.categoryId === categoryId)
    }
  }
  if (query.serviceItemId) {
    const serviceItemId = String(query.serviceItemId)
    if (serviceItemId !== 'all' && serviceItemId !== 'undefined') {
      list = list.filter((s) => s.serviceItemId === serviceItemId)
    }
  }

  return { list, total: list.length }
}

async function loadPublishedPlansFromDb(query = {}) {
  const where = {
    saleStatus: PLAN_SALE_STATUS.ONLINE,
  }
  if (query.storeId) {
    where.storeId = String(query.storeId)
  }
  if (query.categoryId) {
    const categoryId = String(query.categoryId)
    if (categoryId !== 'all' && categoryId !== 'undefined') {
      where.categoryId = categoryId
    }
  }
  if (query.serviceItemId) {
    const serviceItemId = String(query.serviceItemId)
    if (serviceItemId !== 'all' && serviceItemId !== 'undefined') {
      where.serviceItemId = serviceItemId
    }
  }

  const rows = await prisma.merchantServicePlan.findMany({
    where,
    orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
  })

  if (!rows.length) {
    return listPublishedServices(query)
  }

  const storeIds = [...new Set(rows.map((r) => r.storeId))]
  const stores = await prisma.store.findMany({
    where: { id: { in: storeIds }, status: 'ACTIVE' },
  })
  const storeMap = new Map(stores.map((s) => [s.id, s]))

  const list = rows
    .filter((row) => storeMap.has(row.storeId))
    .map((row) => {
      const formatted = formatPlanRecord(row, storeMap.get(row.storeId))
      return {
        ...formatted,
        status: 'published',
        onlinePaymentEnabled: false,
      }
    })

  return { list, total: list.length }
}

async function listServices(query = {}) {
  const { list, total } = await loadPublishedPlansFromDb(query)
  return { list, total }
}

async function attachRelatedCasesToService(record, opts = {}) {
  const allCases = await fetchPublicCaseRows()
  return {
    ...record,
    ...resolveRelatedCasesForService(record, allCases, opts),
  }
}

async function getServiceDetail(id) {
  const row = await prisma.merchantServicePlan.findUnique({ where: { id } })
  if (row && isPubliclyVisible(row)) {
    const store = await prisma.store.findUnique({ where: { id: row.storeId } })
    if (!store || store.status !== 'ACTIVE') {
      const err = new Error('该服务已下架，请查看其他服务')
      err.status = 404
      throw err
    }
    return enrichServicePublicPage(
      await attachRelatedCasesToService(
        {
          ...formatPlanRecord(row, store),
          status: 'published',
          onlinePaymentEnabled: false,
        },
        { limit: 3 }
      )
    )
  }

  const record = SEED_SERVICES.find((s) => s.id === id)
  if (!record) {
    const err = new Error('该服务已下架，请查看其他服务')
    err.status = 404
    throw err
  }
  if (record.status !== 'published') {
    const err = new Error('该服务已下架，请查看其他服务')
    err.status = 404
    throw err
  }

  const store = await prisma.store.findUnique({ where: { id: record.storeId } })
  if (!store || store.status !== 'ACTIVE') {
    const err = new Error('该服务已下架，请查看其他服务')
    err.status = 404
    throw err
  }

  return enrichServicePublicPage(
    await attachRelatedCasesToService(
      { ...record, storeName: store.name || record.storeName },
      { limit: 3 }
    )
  )
}

function filterGeoPages(keyword) {
  // 兼容旧同步调用；异步搜索请用 searchPublishedGeoPages
  return []
}

async function filterGeoPagesAsync(keyword) {
  return searchPublishedGeoPages(keyword)
}

function buildSuggestItems(keyword, services, merchants, cases, geoPages) {
  const k = normalizeKeyword(keyword)
  if (!k) return []

  const items = []
  const typeLabels = {
    service: '服务',
    merchant: '门店',
    case: '案例',
    geo: '专题',
  }

  services.slice(0, 3).forEach((item) => {
    items.push({
      keyword: item.name,
      type: 'service',
      typeLabel: typeLabels.service,
      targetId: item.id,
    })
  })
  merchants.slice(0, 2).forEach((item) => {
    items.push({
      keyword: item.name,
      type: 'merchant',
      typeLabel: typeLabels.merchant,
      targetId: item.id,
    })
  })
  cases.slice(0, 2).forEach((item) => {
    items.push({
      keyword: item.title,
      type: 'case',
      typeLabel: typeLabels.case,
      targetId: item.id,
    })
  })
  geoPages.slice(0, 2).forEach((item) => {
    items.push({
      keyword: item.title,
      type: 'geo',
      typeLabel: typeLabels.geo,
      targetId: item.id,
      path: item.h5Path || '',
    })
  })

  return items.slice(0, 8)
}

async function searchContent(query = {}) {
  const keyword = normalizeKeyword(query.keyword)
  const tab = query.tab || 'all'
  const sort = query.sort || 'relevance'
  const filters = query.filters || {}
  const coords = parseSearchCoords(query)
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.max(1, Number(query.pageSize) || 20)

  const [{ list: services }, { list: merchants }, { list: cases }] = await Promise.all([
    listServices(),
    listMerchants(),
    listCases(),
  ])

  const storeId = query.storeId ? String(query.storeId).trim() : ''

  let matchedServices = services.filter((item) => matchSearchService(item, keyword))
  let matchedMerchants = merchants.filter((item) => matchSearchMerchant(item, keyword))
  let matchedCases = cases.filter((item) => matchSearchCase(item, keyword))
  let geoPages = await filterGeoPagesAsync(keyword)

  if (storeId) {
    matchedServices = matchedServices.filter((item) => item.storeId === storeId)
    matchedMerchants = matchedMerchants.filter((item) => item.id === storeId)
    matchedCases = matchedCases.filter((item) => item.storeId === storeId)
    geoPages = []
  }

  const { serviceList, merchantList, caseList, activeList } = prepareSearchLists({
    tab,
    sort,
    filters,
    coords,
    services: matchedServices,
    merchants: matchedMerchants,
    cases: matchedCases,
  })

  const packed = packSearchResults({
    tab,
    page,
    pageSize,
    serviceList,
    merchantList,
    caseList,
    activeList,
    geoPages,
  })

  return {
    keyword,
    tab,
    sort,
    filters,
    ...packed,
    hotwords: SEARCH_HOTWORDS,
  }
}

async function getSearchConfig() {
  return {
    city: { code: 'hangzhou', name: '杭州', isServiceCity: true },
    hotwords: SEARCH_HOTWORDS,
  }
}

async function getSearchSuggest(keyword) {
  const k = normalizeKeyword(keyword)
  if (!k) return []

  const [{ list: services }, { list: merchants }, { list: cases }] = await Promise.all([
    listServices(),
    listMerchants(),
    listCases(),
  ])

  const filteredServices = services.filter((item) => matchSearchService(item, k))
  const filteredMerchants = merchants.filter((item) => matchSearchMerchant(item, k))
  const filteredCases = cases.filter((item) => matchSearchCase(item, k))
  const geoPages = await filterGeoPagesAsync(k)

  return buildSuggestItems(k, filteredServices, filteredMerchants, filteredCases, geoPages)
}

module.exports = {
  listCases,
  getCaseDetail,
  listMerchants,
  getMerchantDetail,
  listServices,
  getServiceDetail,
  attachRelatedCasesToService,
  getSearchConfig,
  getSearchSuggest,
  searchContent,
  fetchPublicCaseRows,
  mapStoreRow,
  mapPublicCaseRow,
  applyPublicDisplayRules,
}
