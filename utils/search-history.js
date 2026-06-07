const {

  SEARCH_HISTORY_KEY,

  SEARCH_HISTORY_MAX,

} = require('../constants/search')

const { isLoggedIn } = require('./auth')



function normalizeKeyword(keyword) {

  return String(keyword || '').trim()

}



function getSearchHistory() {

  try {

    const list = wx.getStorageSync(SEARCH_HISTORY_KEY)

    return Array.isArray(list) ? list : []

  } catch (e) {

    return []

  }

}



function saveSearchHistory(list) {

  wx.setStorageSync(SEARCH_HISTORY_KEY, list)

}



function applyHistoryList(keywords) {

  const next = (keywords || [])

    .map((item) => normalizeKeyword(item))

    .filter(Boolean)

    .slice(0, SEARCH_HISTORY_MAX)

  saveSearchHistory(next)

  return next

}



function addSearchHistoryLocal(keyword) {

  const value = normalizeKeyword(keyword)

  if (!value) return getSearchHistory()

  const prev = getSearchHistory().filter((item) => item !== value)

  const next = [value, ...prev].slice(0, SEARCH_HISTORY_MAX)

  saveSearchHistory(next)

  return next

}



function addSearchHistory(keyword) {

  const local = addSearchHistoryLocal(keyword)

  if (!isLoggedIn()) {

    return Promise.resolve(local)

  }

  const { postSearchHistory } = require('../services/search')

  return postSearchHistory(keyword)

    .then((data) => {

      const keywords = (data && data.keywords) || local

      return applyHistoryList(keywords)

    })

    .catch(() => local)

}



function clearSearchHistoryLocal() {

  saveSearchHistory([])

  return []

}



function clearSearchHistory() {

  clearSearchHistoryLocal()

  if (!isLoggedIn()) {

    return Promise.resolve([])

  }

  const { clearRemoteSearchHistory } = require('../services/search')

  return clearRemoteSearchHistory().catch(() => [])

}



function syncSearchHistoryFromCloud() {

  if (!isLoggedIn()) {

    return Promise.resolve(getSearchHistory())

  }

  const { fetchSearchHistory } = require('../services/search')

  return fetchSearchHistory()

    .then((data) => {

      const keywords = (data && data.keywords) || []

      return applyHistoryList(keywords)

    })

    .catch(() => getSearchHistory())

}



module.exports = {

  getSearchHistory,

  addSearchHistory,

  addSearchHistoryLocal,

  clearSearchHistory,

  syncSearchHistoryFromCloud,

}

