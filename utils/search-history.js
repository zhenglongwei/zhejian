const {
  SEARCH_HISTORY_KEY,
  SEARCH_HISTORY_MAX,
} = require('../constants/search')

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

function addSearchHistory(keyword) {
  const value = normalizeKeyword(keyword)
  if (!value) return getSearchHistory()
  const prev = getSearchHistory().filter((item) => item !== value)
  const next = [value, ...prev].slice(0, SEARCH_HISTORY_MAX)
  saveSearchHistory(next)
  return next
}

function clearSearchHistory() {
  saveSearchHistory([])
  return []
}

module.exports = {
  getSearchHistory,
  addSearchHistory,
  clearSearchHistory,
}
