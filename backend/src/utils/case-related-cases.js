/**
 * DS-C-11 · 案例页相关案例推荐（PRD 02_公开案例详情页 §6.18）
 */
const { getServiceItem } = require('../constants/service-catalog')
const { matchServiceName } = require('./service-case-link')

function extractVehicleText(item) {
  if (item.vehicleText) return String(item.vehicleText).trim()
  const row = (item.keyInfo || []).find(
    (entry) => entry && (entry.label === '车型' || entry.label === '车辆')
  )
  return row && row.value ? String(row.value).trim() : ''
}

function normalizeVehicleToken(text) {
  return String(text || '')
    .replace(/（已脱敏）/g, '')
    .replace(/\s/g, '')
    .toLowerCase()
}

function isSameVehicle(a, b) {
  const va = normalizeVehicleToken(extractVehicleText(a))
  const vb = normalizeVehicleToken(extractVehicleText(b))
  if (!va || !vb) return false
  if (va === vb) return true
  const minLen = Math.min(va.length, vb.length)
  if (minLen >= 4 && (va.includes(vb) || vb.includes(va))) return true
  return false
}

function matchesService(caseItem, itemName) {
  if (!itemName) return false
  return matchServiceName(caseItem.serviceName, itemName)
}

function dedupeCases(list, excludeId) {
  const seen = new Set()
  return (list || []).filter((item) => {
    if (!item || !item.id || item.id === excludeId) return false
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function mergeTiers(tiers, limit) {
  const merged = []
  const seen = new Set()
  tiers.forEach((tier) => {
    tier.forEach((item) => {
      if (!item || !item.id || seen.has(item.id)) return
      seen.add(item.id)
      merged.push(item)
    })
  })
  return merged.slice(0, limit)
}

/**
 * @param {object} caseItem
 * @param {object[]} allCases
 * @param {{ limit?: number, serviceItemId?: string, sameStoreOnly?: boolean }} [opts]
 */
function resolveRelatedCasesForCase(caseItem, allCases, opts = {}) {
  const limit = opts.limit != null ? opts.limit : 3
  const excludeId = caseItem.id
  const sameStoreOnly = Boolean(opts.sameStoreOnly) && Boolean(caseItem.storeId)
  let pool = dedupeCases(allCases, excludeId)
  if (sameStoreOnly) {
    pool = pool.filter((c) => c.storeId === caseItem.storeId)
  }

  const catalogItem = opts.serviceItemId ? getServiceItem(opts.serviceItemId) : null
  const itemName = catalogItem?.name || caseItem.serviceName || ''
  const city = caseItem.city || ''

  const tier1 = pool.filter(
    (c) => matchesService(c, itemName) && city && c.city === city
  )
  const tier2 = pool.filter(
    (c) =>
      matchesService(c, itemName) &&
      !tier1.some((t) => t.id === c.id) &&
      (!city || c.city !== city)
  )
  const tier3 = pool.filter(
    (c) =>
      isSameVehicle(c, caseItem) &&
      !tier1.some((t) => t.id === c.id) &&
      !tier2.some((t) => t.id === c.id)
  )
  const tier4 = pool.filter(
    (c) =>
      caseItem.storeId &&
      c.storeId === caseItem.storeId &&
      !tier1.some((t) => t.id === c.id) &&
      !tier2.some((t) => t.id === c.id) &&
      !tier3.some((t) => t.id === c.id)
  )
  const tier5 = sameStoreOnly
    ? []
    : pool.filter(
        (c) =>
          city &&
          c.city === city &&
          !tier1.some((t) => t.id === c.id) &&
          !tier2.some((t) => t.id === c.id) &&
          !tier3.some((t) => t.id === c.id) &&
          !tier4.some((t) => t.id === c.id)
      )

  const relatedCases = mergeTiers([tier1, tier2, tier3, tier4, tier5], limit)
  let tier = 'none'
  if (tier1.length) tier = 'service_city'
  else if (tier2.length) tier = 'service'
  else if (tier3.length) tier = 'vehicle'
  else if (tier4.length) tier = 'store'
  else if (tier5.length) tier = 'city'

  return { relatedCases, relatedCaseTier: tier }
}

module.exports = {
  resolveRelatedCasesForCase,
  extractVehicleText,
}
