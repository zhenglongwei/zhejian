/**
 * 用户端相册列表 Tab 筛选
 * - public：已公开展示（public_approved）
 * - private：尚未公开（含维修中、已完工未公开、审核中、撤回后）
 */
function filterUserAlbumsByTab(albums, tab, resolvePublicCaseStatus) {
  const key = tab === 'public' ? 'public' : 'private'

  const resolve =
    typeof resolvePublicCaseStatus === 'function'
      ? resolvePublicCaseStatus
      : (album) => album.publicCaseStatus || 'private'

  if (key === 'public') {
    return albums.filter((album) => resolve(album) === 'public_approved')
  }

  return albums.filter((album) => resolve(album) !== 'public_approved')
}

module.exports = { filterUserAlbumsByTab }
