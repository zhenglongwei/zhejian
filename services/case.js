/**
 * 案例服务 — V0.1 mock + 本地商家提交合并
 * MOCK: 种子数据 + storage 已发布案例
 */
const { SEED_CASES } = require('../mock/cases')
const { CASE_SOURCE } = require('../constants/case-source')
const { getServiceItem } = require('../constants/service')
const { matchServiceName } = require('../utils/service-case-link')
const {
  buildPublicAlbumNodes,
  pickDesensitizedCover,
  sanitizePublicCase,
} = require('../utils/desensitize-mock')

const { buildCaseFaq } = require('../utils/case-faq')

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

function mergeCases() {
  const local = loadPublishedFromStorage()
  const map = new Map()
  SEED_CASES.forEach((c) => map.set(c.id, c))
  local
    .filter((c) => c.maskingConfirmed !== false)
    .forEach((c) => map.set(c.id, c))
  return Array.from(map.values())
    .map(sanitizePublicCase)
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
  await delay()
  let list = mergeCases()
  if (query.source) {
    list = list.filter((c) => c.source === query.source)
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
  await delay()
  const item = mergeCases().find((c) => c.id === id)
  if (!item) {
    const err = new Error('案例不存在')
    err.code = 404
    throw err
  }
  const faq = item.faq && item.faq.length ? item.faq : buildCaseFaq(item.serviceName)
  const relatedCases = mergeCases()
    .filter(
      (c) =>
        c.id !== item.id &&
        (c.serviceName === item.serviceName || c.storeId === item.storeId)
    )
    .slice(0, 3)
  return {
    ...item,
    faq,
    relatedCases,
  }
}

/** 商家审核通过后写入用户可见案例库（仅脱敏字段） */
function publishCaseFromAlbum(album) {
  if (!album || !album.maskingConfirmed) {
    const err = new Error('未完成脱敏确认，无法发布案例')
    err.code = 403
    throw err
  }
  const cases = loadPublishedFromStorage()
  const coverImageDesensitized =
    album.coverImageDesensitized || pickDesensitizedCover(album.nodes)
  const publicNodes = buildPublicAlbumNodes(album.nodes)

  const caseItem = sanitizePublicCase({
    id: `case_${album.id}`,
    source: CASE_SOURCE.MERCHANT_HISTORY,
    coverImage: coverImageDesensitized,
    coverImageDesensitized,
    title: album.title || `${album.vehicleText || '车辆'} · ${album.serviceName}`,
    vehicleText: album.vehicleText || '（已脱敏）',
    serviceName: album.serviceName,
    summary: album.summary || '',
    priceMode: album.priceMode,
    minAmount: album.minAmount,
    maxAmount: album.maxAmount,
    storeId: album.storeId,
    storeName: album.storeName,
    city: album.city || '杭州',
    viewCount: 0,
    publishedAt: new Date().toISOString().slice(0, 10),
    tags: ['desensitized', 'audited', 'reference'],
    aiSummary: album.aiSummary || album.summary || '',
    keyInfo: [
      { label: '城市', value: album.city || '杭州' },
      { label: '服务项目', value: album.serviceName },
      { label: '案例来源', value: '商家历史案例' },
    ],
    faultDesc: album.faultDesc || '',
    inspectResult: album.inspectResult || '',
    repairPlan: album.repairPlan || '',
    priceFactors: album.priceFactors || [],
    nodes: publicNodes,
    faq: album.faq || buildCaseFaq(album.serviceName),
    maskingConfirmed: true,
  })
  const next = cases.filter((c) => c.id !== caseItem.id)
  next.unshift(caseItem)
  wx.setStorageSync(STORAGE_PUBLISHED, next)
  return caseItem
}

/** 平台订单授权公开后写入案例库 */
function publishCaseFromOrderAlbum(draft) {
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
    faq: draft.faq || buildCaseFaq(draft.serviceName),
  })
  const next = cases.filter((c) => c.id !== caseItem.id)
  next.unshift(caseItem)
  wx.setStorageSync(STORAGE_PUBLISHED, next)
  return caseItem
}

module.exports = {
  fetchCaseList,
  fetchCaseDetail,
  publishCaseFromAlbum,
  publishCaseFromOrderAlbum,
}
