/**
 * 评价标签频次统计（mock 本地；联调后由服务端聚合）
 * 供门店列表/详情展示高频标签，如「服务专业」「价格透明」
 */
const STORAGE_TAG_STATS = 'review_tag_stats_v1'

function loadAllStats() {
  try {
    return wx.getStorageSync(STORAGE_TAG_STATS) || {}
  } catch (e) {
    return {}
  }
}

function saveAllStats(map) {
  wx.setStorageSync(STORAGE_TAG_STATS, map)
}

function incrementStoreTagStats(storeId, tags) {
  if (!storeId || !tags || !tags.length) return
  const all = loadAllStats()
  const storeStats = { ...(all[storeId] || {}) }
  tags.forEach((tag) => {
    if (!tag) return
    storeStats[tag] = (storeStats[tag] || 0) + 1
  })
  all[storeId] = storeStats
  saveAllStats(all)
}

/**
 * @param {string} storeId
 * @param {number} [limit=3]
 * @returns {string[]}
 */
function getStoreTopReviewTags(storeId, limit = 3) {
  if (!storeId) return []
  const storeStats = loadAllStats()[storeId] || {}
  return Object.keys(storeStats)
    .sort((a, b) => storeStats[b] - storeStats[a])
    .slice(0, limit)
}

module.exports = {
  incrementStoreTagStats,
  getStoreTopReviewTags,
  loadAllStats,
}
