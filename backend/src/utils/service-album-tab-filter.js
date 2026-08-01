const { normalizeServiceAlbumListTab } = require('../../../constants/service-album-status')

/** 案例审已通过及之后（与 case-review-gate CASE_REVIEW_PASSED_STATUSES 对齐） */
const REVIEW_PASSED_STATUSES = new Set(['review_passed', 'public_approved', 'offline'])

/**
 * 用户端相册列表 Tab 筛选
 * - all：全部
 * - active：进行中（尚未案例审通过）
 * - done：已完工（已案例审通过及之后，含撤回后 offline）
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

  if (key === 'done') {
    return albums.filter((album) => REVIEW_PASSED_STATUSES.has(resolve(album)))
  }

  return albums.filter((album) => !REVIEW_PASSED_STATUSES.has(resolve(album)))
}

module.exports = {
  filterUserAlbumsByTab,
  REVIEW_PASSED_STATUSES,
  /** @deprecated 使用 REVIEW_PASSED_STATUSES */
  PUBLISHED_STATUSES: REVIEW_PASSED_STATUSES,
}
