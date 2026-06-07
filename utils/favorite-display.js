function enrichFavoriteListItem(entry = {}) {
  const item = entry.item || {}
  return {
    favoriteId: entry.favoriteId || '',
    targetType: entry.targetType || '',
    targetId: entry.targetId || '',
    available: entry.available !== false,
    unavailableReason: entry.unavailableReason || '暂不可用',
    item,
  }
}

module.exports = {
  enrichFavoriteListItem,
}
