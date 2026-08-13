const {
  normalizeServiceAlbumListTab,
  SERVICE_ALBUM_REPAIR_DONE_STATUSES,
} = require('../../../constants/service-album-status')

/** @deprecated 案例审分档已废止；保留导出以免旧引用报错 */
const REVIEW_PASSED_STATUSES = new Set(['review_passed', 'public_approved', 'offline'])

function isAlbumRepairDoneForTab(album) {
  const status = String((album && album.status) || '')
  return SERVICE_ALBUM_REPAIR_DONE_STATUSES.includes(status) || status === 'published'
}

/**
 * 相册列表 Tab 筛选（相册归相册 · 2026-08-13）
 * - all：全部
 * - active：进行中（相册尚未标记完工）
 * - done：已完工（相册已 completed 等维修结束态）
 * 第三参 resolvePublicCaseStatus 保留兼容，不再作为 Tab 轴。
 */
function filterUserAlbumsByTab(albums, tab) {
  const key = normalizeServiceAlbumListTab(tab)

  if (key === 'all') {
    return albums
  }

  if (key === 'done') {
    return (albums || []).filter((album) => isAlbumRepairDoneForTab(album))
  }

  return (albums || []).filter((album) => !isAlbumRepairDoneForTab(album))
}

module.exports = {
  filterUserAlbumsByTab,
  isAlbumRepairDoneForTab,
  REVIEW_PASSED_STATUSES,
  /** @deprecated 使用 REVIEW_PASSED_STATUSES */
  PUBLISHED_STATUSES: REVIEW_PASSED_STATUSES,
}
