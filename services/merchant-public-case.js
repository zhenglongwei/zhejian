const { get } = require('./request')

/**
 * DS-B-12 · 工作台案例发布摘要
 * @param {{ storeId?: string }} [params]
 */
async function fetchMerchantCasePublishPanel(params = {}) {
  return get('/merchant/public-cases/publish-panel', params)
}

async function fetchMerchantCaseArticleExport(caseId, params = {}) {
  return get(`/merchant/public-cases/${encodeURIComponent(caseId)}/article-export`, params)
}

module.exports = {
  fetchMerchantCasePublishPanel,
  fetchMerchantCaseArticleExport,
}
