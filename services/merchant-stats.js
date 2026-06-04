const { get } = require('./request')

/**
 * 商家数据看板区间统计（T+1 日聚合）
 * @param {{ storeId?: string, period?: string, from?: string, to?: string }} params
 */
async function fetchMerchantStats(params = {}) {
  return get('/merchant/stats', params)
}

module.exports = {
  fetchMerchantStats,
}
