const { get } = require('./request')

/**
 * GEO-OBS-C04 · 商家 GEO 机会分
 * @param {{ storeId?: string }} [params]
 */
async function fetchMerchantGeoOpportunity(params = {}) {
  return get('/merchant/geo/opportunity', params)
}

module.exports = {
  fetchMerchantGeoOpportunity,
}
