const { normalizeServiceAlbumListTab } = require('../../../constants/service-album-status')

const PUBLISHED_STATUSES = new Set(['pending_review', 'public_approved'])

/**
 * 用户端相册列表 Tab 筛选
 * - all：全部
 * - publishable：可公示（未提交/私密/审核未通过，不含审核中与已通过）
 * - published：已公示（审核中 + 审核通过）
 */
function filterUserAlbumsByTab(albums, tab, resolvePublicCaseStatus) {
  const key = normalizeServiceAlbumListTab(tab)

  const resolve =
    typeof resolvePublicCaseStatus === 'function'
      ? resolvePublicCaseStatus
      : (album) => album.publicCaseStatus || 'private'

  if (key === 'all') {
    return albums
  }

  if (key === 'published') {
    return albums.filter((album) => PUBLISHED_STATUSES.has(resolve(album)))
  }

  return albums.filter((album) => !PUBLISHED_STATUSES.has(resolve(album)))
}

module.exports = { filterUserAlbumsByTab, PUBLISHED_STATUSES }
