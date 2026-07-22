/**
 * 小程序内门店隔离下的关联案例补齐：
 * API 若仍带回外店案例，过滤后可能变空；从本店案例列表回填。
 */
const { fetchCaseList } = require('../services/case')
const { filterCasesByStore } = require('./share-store-context')

/**
 * @param {object[]} relatedCases
 * @param {{ storeId?: string, excludeId?: string, limit?: number }} opts
 */
async function isolateRelatedCases(relatedCases, opts = {}) {
  const storeId = opts.storeId ? String(opts.storeId) : ''
  const limit = opts.limit != null ? opts.limit : 3
  const excludeId = opts.excludeId || ''
  if (!storeId) return Array.isArray(relatedCases) ? relatedCases.slice(0, limit) : []

  let next = filterCasesByStore(relatedCases || [], storeId).filter(
    (item) => item && item.id && item.id !== excludeId
  )
  if (next.length >= limit) return next.slice(0, limit)

  try {
    const { list } = await fetchCaseList({ storeId, limit: 30 })
    const seen = new Set(next.map((item) => item.id))
    ;(list || []).forEach((item) => {
      if (!item || !item.id || item.id === excludeId || seen.has(item.id)) return
      seen.add(item.id)
      next.push(item)
    })
  } catch (e) {
    // 回填失败时保留已过滤结果
  }
  return next.slice(0, limit)
}

module.exports = {
  isolateRelatedCases,
}
