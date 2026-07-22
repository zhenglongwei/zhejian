/**
 * B-SVC-06 · 服务关联公开案例 — PRD §10 三级优先级
 */
const { getServiceItem, getCategoryName } = require('../constants/service-catalog')

function normalizeServiceName(name) {
  return String(name || '').replace(/\s/g, '').toLowerCase()
}

function matchServiceName(caseServiceName, itemName) {
  if (!caseServiceName || !itemName) return false
  const a = normalizeServiceName(caseServiceName)
  const b = normalizeServiceName(itemName)
  return a.includes(b) || b.includes(a)
}

function dedupeCases(list) {
  const seen = new Set()
  return list.filter((c) => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })
}

/**
 * @param {object} service — formatPlanRecord 或 seed 服务
 * @param {object[]} allCases
 * @param {{ limit?: number, sameStoreOnly?: boolean }} [opts]
 */
function resolveRelatedCasesForService(service, allCases, opts = {}) {
  const limit = opts.limit != null ? opts.limit : 3
  const sameStoreOnly = Boolean(opts.sameStoreOnly)
  const item = getServiceItem(service.serviceItemId)
  const itemName = item ? item.name : ''
  const categoryName =
    service.categoryName || getCategoryName(service.categoryId || item?.categoryId)

  const tier1 = allCases.filter(
    (c) => c.storeId === service.storeId && matchServiceName(c.serviceName, itemName)
  )

  const tier2 = allCases.filter(
    (c) =>
      c.storeId === service.storeId &&
      !tier1.some((t) => t.id === c.id) &&
      (matchServiceName(c.serviceName, service.name) ||
        (c.serviceName &&
          categoryName &&
          c.serviceName.includes(categoryName.replace('服务', ''))))
  )

  const tier3 = sameStoreOnly
    ? []
    : allCases.filter(
        (c) =>
          !tier1.some((t) => t.id === c.id) &&
          !tier2.some((t) => t.id === c.id) &&
          matchServiceName(c.serviceName, itemName)
      )

  const tier4 = sameStoreOnly
    ? []
    : allCases.filter(
        (c) =>
          !tier1.some((t) => t.id === c.id) &&
          !tier2.some((t) => t.id === c.id) &&
          !tier3.some((t) => t.id === c.id)
      )

  let tier = 'none'
  let merged = []
  if (tier1.length) {
    tier = 'store_service'
    merged = tier1
  } else if (tier2.length) {
    tier = 'store_near'
    merged = tier2
  } else if (tier3.length) {
    tier = 'platform'
    merged = tier3
  } else if (tier4.length) {
    tier = 'featured'
    merged = tier4
  }

  merged = dedupeCases(merged)
  return {
    relatedCases: merged.slice(0, limit),
    caseTotal: merged.length,
    caseLinkTier: tier,
  }
}

module.exports = {
  resolveRelatedCasesForService,
  matchServiceName,
}
