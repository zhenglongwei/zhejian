/**
 * 搜索关键词匹配 — 前后端共用
 */

/** 同义词组：任一词命中即扩展整组参与子串匹配 */
const SEARCH_SYNONYM_GROUPS = [
  ['事故车', '事故车检测', '事故车维修', '事故维修'],
  ['小保养', '保养'],
  ['补漆', '喷漆', '漆面修复'],
  ['电瓶', '蓄电池'],
]

function normalizeKeyword(keyword) {
  return String(keyword || '').trim()
}

function getKeywordVariants(keyword) {
  const k = normalizeKeyword(keyword)
  if (!k) return ['']
  const variants = new Set([k])
  SEARCH_SYNONYM_GROUPS.forEach((group) => {
    if (group.some((term) => k.includes(term) || term.includes(k))) {
      group.forEach((term) => variants.add(term))
    }
  })
  return Array.from(variants)
}

function includesKeyword(text, keyword) {
  if (!keyword) return true
  return String(text || '')
    .toLowerCase()
    .includes(keyword.toLowerCase())
}

function matchAnyField(keyword, fields) {
  const variants = getKeywordVariants(keyword)
  return variants.some((variant) => {
    const k = normalizeKeyword(variant)
    if (!k) return true
    return fields.some((field) => includesKeyword(field, variant))
  })
}

function matchSearchService(item, keyword) {
  return matchAnyField(keyword, [
    item.name,
    item.summary,
    item.categoryName,
    item.storeName,
    item.detail,
  ])
}

function matchSearchMerchant(item, keyword) {
  const specialties = Array.isArray(item.specialties)
    ? item.specialties.join(' ')
    : item.specialties
  return matchAnyField(keyword, [
    item.name,
    item.address,
    specialties,
    item.city,
  ])
}

function matchSearchCase(item, keyword) {
  return matchAnyField(keyword, [
    item.title,
    item.summary,
    item.serviceName,
    item.vehicleText,
    item.storeName,
    item.city,
    item.aiSummary,
    item.faultDesc,
    item.inspectResult,
    item.repairPlan,
  ])
}

/** 当前 Tab 无结果时，切到有结果的 Tab（优先案例） */
function pickSearchResultTab(counts = {}, preferredTab = 'service') {
  const tab = preferredTab || 'service'
  if ((counts[tab] || 0) > 0) return tab
  const order = ['case', 'service', 'merchant']
  for (let i = 0; i < order.length; i += 1) {
    if ((counts[order[i]] || 0) > 0) return order[i]
  }
  return tab
}

module.exports = {
  normalizeKeyword,
  getKeywordVariants,
  includesKeyword,
  matchSearchService,
  matchSearchMerchant,
  matchSearchCase,
  pickSearchResultTab,
}
