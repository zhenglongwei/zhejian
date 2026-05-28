const { prisma } = require('../lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { sanitizeClientMediaUrl } = require('../lib/media-url')
const { buildPublicCasePrice } = require('../utils/album-price')
const { buildCaseFaq } = require('../utils/case-faq')
const {
  SEED_SERVICES,
  STORE_EXTRAS,
  SEARCH_HOTWORDS,
  SERVICE_ITEM_NAME_MAP,
  FALLBACK_PUBLIC_CASES,
} = require('../constants/content-seed')
const { HOME_GEO_TOPICS } = require('../constants/home')

const STORE_STATUS_MAP = {
  ACTIVE: 'open',
  DRAFT: 'offline',
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

function matchServiceName(serviceName, itemName) {
  if (!itemName) return true
  if (!serviceName) return false
  return (
    serviceName === itemName ||
    serviceName.includes(itemName) ||
    itemName.includes(serviceName)
  )
}

function formatPublishedAt(value) {
  if (!value) return ''
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  return String(value).slice(0, 10)
}

function sanitizeCover(url) {
  return sanitizeClientMediaUrl(url) || ''
}

function sanitizeNodes(nodes) {
  return (nodes || []).map((node) => ({
    id: node.id || node.nodeId || '',
    title: node.title || '',
    note: node.note || '',
    images: (node.images || [])
      .map((img) => sanitizeCover(typeof img === 'string' ? img : img.url || img.maskedUrl || ''))
      .filter(Boolean),
  }))
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
    return { ...next, storeName: '' }
  }
  return next
}

function pickCaseCover(row, content) {
  const direct = sanitizeCover(row.coverImage)
  if (direct) return direct
  for (const node of content.nodes || []) {
    for (const img of node.images || []) {
      const url = typeof img === 'string' ? img : img.url || img.maskedUrl || ''
      const cover = sanitizeCover(url)
      if (cover) return cover
    }
  }
  return ''
}

function mapPublicCaseRow(row) {
  const content = row.contentJson && typeof row.contentJson === 'object' ? row.contentJson : {}
  const cover = pickCaseCover(row, content)
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
    priceMode: row.priceMode || 'range',
    amount: row.minAmount === row.maxAmount ? row.minAmount : null,
    planAmount: row.minAmount,
    minAmount: row.minAmount,
    maxAmount: row.maxAmount,
    storeId: row.storeId || '',
    storeName: row.storeName || '',
    city: row.city || '杭州',
    viewCount: 0,
    publishedAt: formatPublishedAt(row.publishedAt),
    tags: content.tags || ['authorized', 'desensitized', 'audited'],
    aiSummary: content.aiSummary || row.summary || '',
    keyInfo: content.keyInfo || [],
    faultDesc: content.faultDesc || '',
    inspectResult: content.inspectResult || '',
    repairPlan: content.repairPlan || '',
    priceFactors: content.priceFactors || [],
    nodes: sanitizeNodes(content.nodes),
    faq: content.faq || [],
  }
  return applyPublicDisplayRules(item)
}

function mapFallbackCase(item) {
  return applyPublicDisplayRules({
    ...item,
    coverImage: sanitizeCover(item.coverImage),
    coverImageDesensitized: sanitizeCover(item.coverImage),
    nodes: sanitizeNodes(item.nodes),
  })
}

async function fetchPublicCaseRows() {
  const rows = await prisma.publicCase.findMany({
    where: { status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED },
    orderBy: { publishedAt: 'desc' },
  })
  if (rows.length) return rows.map(mapPublicCaseRow)
  return FALLBACK_PUBLIC_CASES.map(mapFallbackCase)
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
    const itemName = SERVICE_ITEM_NAME_MAP[query.serviceItemId] || ''
    list = list.filter((c) => matchServiceName(c.serviceName, itemName))
  }
  if (query.serviceType) {
    list = list.filter(
      (c) => c.serviceName && c.serviceName.indexOf(query.serviceType) !== -1
    )
  }

  const total = list.length
  const limit = query.limit != null ? parseInt(String(query.limit), 10) : 0
  if (limit > 0) {
    list = list.slice(0, limit)
  }

  return { list, total }
}

async function getCaseDetail(id) {
  const row = await prisma.publicCase.findFirst({
    where: { id, status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED },
  })

  let item
  if (row) {
    item = mapPublicCaseRow(row)
  } else {
    const fallback = FALLBACK_PUBLIC_CASES.find((c) => c.id === id)
    if (!fallback) {
      const err = new Error('案例不存在')
      err.status = 404
      throw err
    }
    item = mapFallbackCase(fallback)
  }

  const { list: allCases } = await listCases()
  const relatedCases = allCases
    .filter(
      (c) =>
        c.id !== item.id &&
        (c.serviceName === item.serviceName || c.storeId === item.storeId)
    )
    .slice(0, 3)

  let storePhone = ''
  if (item.storeId) {
    const store = await prisma.store.findUnique({ where: { id: item.storeId } })
    storePhone = store?.phone || ''
  }

  const faq = item.faq && item.faq.length ? item.faq : buildCaseFaq(item.serviceName)
  const display = applyPublicDisplayRules(item)

  return {
    ...display,
    storePhone,
    showStorePublicly: shouldShowStorePublicly(item.authorizationTier),
    faq,
    relatedCases,
  }
}

function mapStoreRow(store, caseCount = 0) {
  const extras = STORE_EXTRAS[store.id] || {}
  const clientStatus = STORE_STATUS_MAP[store.status] || 'offline'
  return {
    id: store.id,
    name: store.name || '',
    status: extras.status || clientStatus,
    auditStatus: extras.auditStatus || 'approved',
    address: store.address || '',
    latitude: extras.latitude || null,
    longitude: extras.longitude || null,
    businessHours: extras.businessHours || '',
    phone: store.phone || '',
    qualificationTags: extras.qualificationTags || [],
    specialties: extras.specialties || [],
    score: extras.score || 0,
    caseCount,
    supportsAlbum: extras.supportsAlbum !== false,
    coverImage: extras.coverImage || '',
    environmentImages: extras.environmentImages || [],
    certifications: extras.certifications || [],
    aiSummary: extras.aiSummary || '',
  }
}

async function countCasesByStore(storeId) {
  const count = await prisma.publicCase.count({
    where: { storeId, status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED },
  })
  if (count > 0) return count
  return FALLBACK_PUBLIC_CASES.filter((c) => c.storeId === storeId).length
}

async function listActiveStores() {
  return prisma.store.findMany({
    where: { status: 'ACTIVE' },
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
  const store = await prisma.store.findUnique({ where: { id } })
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
  return mapped
}

function listPublishedServices(query = {}) {
  const activeStoreIds = new Set()
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

  return { list, total: list.length, activeStoreIds }
}

async function listServices(query = {}) {
  const stores = await listActiveStores()
  const activeIds = new Set(stores.map((s) => s.id))
  let { list } = listPublishedServices(query)
  list = list.filter((s) => activeIds.has(s.storeId))
  return { list, total: list.length }
}

async function getServiceDetail(id) {
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

  return { ...record, storeName: store.name || record.storeName }
}

function filterGeoPages(keyword) {
  const k = normalizeKeyword(keyword)
  if (!k) return []
  return HOME_GEO_TOPICS.filter((page) => {
    const haystack = [page.title, page.summary].join(' ')
    return includesKeyword(haystack, k)
  }).map((page) => ({
    id: page.id,
    title: page.title,
    summary: page.summary,
    keywords: [],
  }))
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
    })
  })

  return items.slice(0, 8)
}

function sortServices(list, sortKey) {
  const next = list.slice()
  if (sortKey === 'price_asc') {
    next.sort((a, b) => (a.amount || a.minAmount || 0) - (b.amount || b.minAmount || 0))
  } else if (sortKey === 'price_desc') {
    next.sort((a, b) => (b.amount || b.maxAmount || 0) - (a.amount || a.maxAmount || 0))
  }
  return next
}

function sortMerchants(list, sortKey) {
  const next = list.slice()
  if (sortKey === 'case_count') {
    next.sort((a, b) => (b.caseCount || 0) - (a.caseCount || 0))
  }
  return next
}

function sortCases(list, sortKey) {
  const next = list.slice()
  if (sortKey === 'latest') {
    next.sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
  }
  return next
}

function applyFilters(list, tab, filters = {}) {
  let next = list.slice()
  if (tab === 'merchant') {
    if (filters.supportAlbum) {
      next = next.filter((item) => item.supportsAlbum)
    }
    if (filters.accidentCapable) {
      next = next.filter((item) =>
        (item.specialties || []).some((tag) => String(tag).includes('事故'))
      )
    }
  }
  if (tab === 'service' && filters.accidentCapable) {
    next = next.filter((item) => item.priceMode === 'accident')
  }
  return next
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

  const filteredServices = services.filter((item) =>
    matchRecord(item, k, ['name', 'summary', 'categoryName'])
  )
  const filteredMerchants = merchants.filter((item) =>
    matchRecord(item, k, ['name', 'address', 'specialties'])
  )
  const filteredCases = cases.filter((item) =>
    matchRecord(item, k, ['title', 'summary', 'serviceName', 'vehicleText'])
  )
  const geoPages = filterGeoPages(k)

  return buildSuggestItems(k, filteredServices, filteredMerchants, filteredCases, geoPages)
}

async function searchContent(query = {}) {
  const keyword = normalizeKeyword(query.keyword)
  const tab = query.tab || 'service'
  const sort = query.sort || 'relevance'
  const filters = query.filters || {}
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.max(1, Number(query.pageSize) || 20)

  const [{ list: services }, { list: merchants }, { list: cases }] = await Promise.all([
    listServices(),
    listMerchants(),
    listCases(),
  ])

  let serviceList = services.filter((item) =>
    matchRecord(item, keyword, ['name', 'summary', 'categoryName', 'storeName'])
  )
  let merchantList = merchants.filter((item) =>
    matchRecord(item, keyword, ['name', 'address', 'specialties'])
  )
  let caseList = cases.filter((item) =>
    matchRecord(item, keyword, ['title', 'summary', 'serviceName', 'vehicleText', 'storeName'])
  )
  const geoPages = filterGeoPages(keyword)

  serviceList = applyFilters(sortServices(serviceList, sort), 'service', filters)
  merchantList = applyFilters(sortMerchants(merchantList, sort), 'merchant', filters)
  caseList = applyFilters(sortCases(caseList, sort), 'case', filters)

  const tabMap = {
    service: serviceList,
    merchant: merchantList,
    case: caseList,
  }
  const activeList = tabMap[tab] || serviceList
  const start = (page - 1) * pageSize
  const pagedList = activeList.slice(start, start + pageSize)

  return {
    keyword,
    tab,
    sort,
    filters,
    geoPages,
    services: tab === 'service' ? pagedList : serviceList.slice(0, pageSize),
    merchants: tab === 'merchant' ? pagedList : merchantList.slice(0, pageSize),
    cases: tab === 'case' ? pagedList : caseList.slice(0, pageSize),
    list: pagedList,
    total: activeList.length,
    hasMore: start + pageSize < activeList.length,
    counts: {
      service: serviceList.length,
      merchant: merchantList.length,
      case: caseList.length,
      geo: geoPages.length,
    },
    hotwords: SEARCH_HOTWORDS,
  }
}

module.exports = {
  listCases,
  getCaseDetail,
  listMerchants,
  getMerchantDetail,
  listServices,
  getServiceDetail,
  getSearchConfig,
  getSearchSuggest,
  searchContent,
  fetchPublicCaseRows,
  mapStoreRow,
}
