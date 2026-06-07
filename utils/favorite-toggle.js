const { checkAuth } = require('./auth')
const {
  fetchFavoriteStatus,
  addFavorite,
  removeFavorite,
} = require('../services/favorite')
const { mergeLeftActionsWithFavorite } = require('./favorite-actions')

async function loadFavoriteState(page, options = {}) {
  const {
    targetType,
    targetId,
    baseLeftActions = [],
    showFavorite = true,
    dataKey = 'bottomLeftActions',
  } = options

  if (!showFavorite || !targetType || !targetId) {
    page.setData({
      isFavorited: false,
      [dataKey]: baseLeftActions,
    })
    return
  }

  const auth = checkAuth({ needPhone: false })
  if (!auth.ok) {
    page.setData({
      isFavorited: false,
      [dataKey]: mergeLeftActionsWithFavorite(baseLeftActions, false, { showFavorite }),
    })
    return
  }

  try {
    const status = await fetchFavoriteStatus(targetType, targetId)
    page.setData({
      isFavorited: Boolean(status && status.favorited),
      [dataKey]: mergeLeftActionsWithFavorite(baseLeftActions, Boolean(status && status.favorited), {
        showFavorite,
      }),
    })
  } catch (e) {
    page.setData({
      isFavorited: false,
      [dataKey]: mergeLeftActionsWithFavorite(baseLeftActions, false, { showFavorite }),
    })
  }
}

function ensureFavoriteAuth(page, bindContext = 'favorite') {
  const auth = checkAuth({ needPhone: true })
  if (!auth.ok) {
    page.setData({
      loginSheetVisible: true,
      loginSheetMode: auth.reason === 'bindPhone' ? 'bindPhone' : 'auto',
      loginSheetBindContext: bindContext,
      pendingFavoriteToggle: true,
    })
    return false
  }
  return true
}

async function toggleFavorite(page, options = {}) {
  const {
    targetType,
    targetId,
    baseLeftActions = [],
    dataKey = 'bottomLeftActions',
    showFavorite = true,
  } = options

  if (!targetType || !targetId || page._favoriteBusy) return
  if (!ensureFavoriteAuth(page)) return

  page._favoriteBusy = true
  const nextFavorited = !page.data.isFavorited

  try {
    if (nextFavorited) {
      await addFavorite(targetType, targetId)
      wx.showToast({ title: '已收藏', icon: 'success' })
    } else {
      await removeFavorite(targetType, targetId)
      wx.showToast({ title: '已取消收藏', icon: 'none' })
    }
    page.setData({
      isFavorited: nextFavorited,
      [dataKey]: mergeLeftActionsWithFavorite(baseLeftActions, nextFavorited, { showFavorite }),
      pendingFavoriteToggle: false,
    })
  } catch (e) {
    wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
  } finally {
    page._favoriteBusy = false
  }
}

module.exports = {
  loadFavoriteState,
  ensureFavoriteAuth,
  toggleFavorite,
}
