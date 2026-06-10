/**
 * 案例服务 — mock + API
 * prod/dev: GET /api/user/cases、/cases/:id
 */
const { ENV } = require('./config')
const { get } = require('./request')
const { SEED_CASES } = require('../mock/cases')
const { PUBLIC_AUTH_TIER, shouldShowStorePublicly } = require('../constants/case-authorization')
const { getServiceItem } = require('../constants/service')
const { findStore } = require('./store')
const { matchServiceName } = require('../utils/service-case-link')
const {
  buildPublicAlbumNodes,
  pickDesensitizedCover,
  sanitizePublicCase,
} = require('../utils/desensitize-mock')
const { buildPublicCasePrice } = require('../utils/album-price')

const STORAGE_PUBLISHED = 'published_cases_v1'

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms))
}

function loadPublishedFromStorage() {
  try {
    return wx.getStorageSync(STORAGE_PUBLISHED) || []
  } catch (e) {
    return []
  }
}

function applyPublicDisplayRules(item) {
  if (!item) return item
  const publicPrice = buildPublicCasePrice(item, {
    hasUserAuthorization:
      item.authorizationTier === PUBLIC_AUTH_TIER.ANONYMOUS ||
      item.authorizationTier === PUBLIC_AUTH_TIER.NAMED,
  })
  const next = {
    ...item,
    priceMode: publicPrice.priceMode,
    amount: publicPrice.amount,
    minAmount: publicPrice.minAmount,
    maxAmount: publicPrice.maxAmount,
    planAmount: publicPrice.planAmount,
  }
  if (!shouldShowStorePublicly(item.authorizationTier)) {
    return {
      ...next,
      storeName: '',
    }
  }
  return next
}

function mergeCases() {
  const local = loadPublishedFromStorage()
  const map = new Map()
  SEED_CASES.forEach((c) => map.set(c.id, c))
  local
    .filter((c) => c.maskingConfirmed !== false)
    .forEach((c) => map.set(c.id, c))
  return Array.from(map.values())
    .map(sanitizePublicCase)
    .map(applyPublicDisplayRules)
    .sort((a, b) => {
      const ta = a.publishedAt || ''
      const tb = b.publishedAt || ''
      return tb.localeCompare(ta)
    })
}

/**
 * @param {{ serviceType?: string, serviceItemId?: string, categoryId?: string, source?: string, storeId?: string, limit?: number }} [query]
 */
async function fetchCaseList(query = {}) {
  if (ENV.mode !== 'mock') {
    return get('/user/cases', query)
  }
  await delay()
  let list = mergeCases()
  if (query.authorizationTier) {
    list = list.filter((c) => c.authorizationTier === query.authorizationTier)
  }
  if (query.storeId) {
    list = list.filter((c) => c.storeId === query.storeId)
  }
  if (query.serviceItemId) {
    const item = getServiceItem(query.serviceItemId)
    const itemName = item ? item.name : ''
    list = list.filter((c) => matchServiceName(c.serviceName, itemName))
  }
  if (query.serviceType) {
    list = list.filter(
      (c) =>
        c.serviceName && c.serviceName.indexOf(query.serviceType) !== -1
    )
  }
  if (query.limit != null && query.limit > 0) {
    list = list.slice(0, query.limit)
  }
  return { list, total: list.length }
}

async function fetchCaseDetail(id) {
  if (ENV.mode !== 'mock') {
    return get(`/user/cases/${id}`)
  }
  await delay()
  const item = mergeCases().find((c) => c.id === id)
  if (!item) {
    const err = new Error('案例不存在')
    err.code = 404
    throw err
  }
  const faq = (item.faq || []).filter((entry) => entry && entry.title && entry.url)
  const relatedCases = mergeCases()
    .filter(
      (c) =>
        c.id !== item.id &&
        (c.serviceName === item.serviceName || c.storeId === item.storeId)
    )
    .slice(0, 3)
  const store = item.storeId ? findStore(item.storeId) : null
  const display = applyPublicDisplayRules(item)
  return {
    ...display,
    storePhone: (store && store.phone) || item.storePhone || '',
    showStorePublicly: shouldShowStorePublicly(item.authorizationTier),
    faq,
    relatedCases,
  }
}

/** 服务相册授权公开后写入案例库 */
function publishFromServiceAlbum(draft) {
  if (!draft || !draft.maskingConfirmed) {
    const err = new Error('未完成脱敏确认，无法发布案例')
    err.code = 403
    throw err
  }
  const cases = loadPublishedFromStorage()
  const publicNodes = buildPublicAlbumNodes(
    (draft.nodes || []).map((node) => ({
      ...node,
      imagesDesensitized: node.imagesDesensitized || node.images || [],
    }))
  )
  const coverImageDesensitized =
    draft.coverImageDesensitized || pickDesensitizedCover(publicNodes)

  const caseItem = sanitizePublicCase({
    ...draft,
    coverImage: coverImageDesensitized,
    coverImageDesensitized,
    nodes: publicNodes,
    faq: (draft.faq || []).filter((entry) => entry && entry.title && entry.url),
  })
  const next = cases.filter((c) => c.id !== caseItem.id)
  next.unshift(caseItem)
  wx.setStorageSync(STORAGE_PUBLISHED, next)
  return caseItem
}

/** @deprecated 使用 publishFromServiceAlbum */
function publishCaseFromOrderAlbum(draft) {
  return publishFromServiceAlbum(draft)
}

/** @deprecated 使用 publishFromServiceAlbum */
function publishCaseFromAlbum(album) {
  return publishFromServiceAlbum({
    ...album,
    id: album.id ? `case_${album.id}` : undefined,
    authorizationTier: album.authorizationTier || PUBLIC_AUTH_TIER.NAMED,
    maskingConfirmed: album.maskingConfirmed !== false,
  })
}

module.exports = {
  fetchCaseList,
  fetchCaseDetail,
  publishFromServiceAlbum,
  publishCaseFromAlbum,
  publishCaseFromOrderAlbum,
}
