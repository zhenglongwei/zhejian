const {
  searchContent,
  getSearchSuggest,
  getSearchConfig,
} = require('./content.service')

/** H5 全站搜索 — 禁止 storeId 收窄（与小程序 DS-D-08 本店搜索区分） */
function sanitizeH5SearchQuery(query = {}) {
  const next = { ...query }
  delete next.storeId
  if (next.filters && typeof next.filters === 'string') {
    try {
      next.filters = JSON.parse(next.filters)
    } catch (e) {
      next.filters = {}
    }
  }
  return next
}

async function searchH5Content(query = {}) {
  return searchContent(sanitizeH5SearchQuery(query))
}

async function getH5SearchSuggest(keyword) {
  return getSearchSuggest(keyword)
}

async function getH5SearchConfig() {
  return getSearchConfig()
}

module.exports = {
  searchH5Content,
  getH5SearchSuggest,
  getH5SearchConfig,
}
