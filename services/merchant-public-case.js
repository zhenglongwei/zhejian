const { get } = require('./request')

/**
 * DS-B-12 · 工作台案例发布摘要
 * @param {{ storeId?: string }} [params]
 */
async function fetchMerchantCasePublishPanel(params = {}) {
  return get('/merchant/public-cases/publish-panel', params)
}

module.exports = {
  fetchMerchantCasePublishPanel,
}
