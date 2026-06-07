function buildFavoriteLeftAction(isFavorited) {
  return {
    key: 'favorite',
    type: 'secondary',
    text: isFavorited ? '已收藏' : '收藏',
  }
}

function mergeLeftActionsWithFavorite(baseActions, isFavorited, options = {}) {
  const { showFavorite = true } = options
  if (!showFavorite) return baseActions
  return [buildFavoriteLeftAction(isFavorited), ...(baseActions || [])]
}

module.exports = {
  buildFavoriteLeftAction,
  mergeLeftActionsWithFavorite,
}
