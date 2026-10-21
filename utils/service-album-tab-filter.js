const {
  normalizeServiceAlbumListTab,
  SERVICE_ALBUM_REPAIR_DONE_STATUSES,
} = require('../constants/service-album-status')

/** @deprecated 案例审分档已废止；保留导出以免旧引用报错 */
const REVIEW_PASSED_STATUSES = new Set(['review_passed', 'public_approved', 'offline'])

function isAlbumRepairDoneForTab(album) {
  const status = String((album && album.status) || '')
  return SERVICE_ALBUM_REPAIR_DONE_STATUSES.includes(status) || status === 'published'
}

function albumAwaitingOwnerConfirm(album) {
  const label = String((album && album.progressLabel) || '')
  if (label.indexOf('待确认') >= 0) return true
  if (Number(album && album.pendingConfirmCount) > 0) return true
  const pkg = album && album.contentPackageJson
  const nodes = pkg && Array.isArray(pkg.flowNodes) ? pkg.flowNodes : []
  return nodes.some((node) => {
    const status = String((node && node.document && node.document.status) || '')
    return status === 'pending_confirm'
  })
}

/**
 * 相册列表 Tab 筛选
 * - all：全部
 * - active：进行中（相册尚未标记完工）
 * - confirm：有单据等车主确认
 * - done：已完工
 */
function filterUserAlbumsByTab(albums, tab) {
  const key = normalizeServiceAlbumListTab(tab)
  const list = albums || []

  if (key === 'all') return list
  if (key === 'done') return list.filter((album) => isAlbumRepairDoneForTab(album))
  if (key === 'confirm') return list.filter((album) => albumAwaitingOwnerConfirm(album))
  return list.filter((album) => !isAlbumRepairDoneForTab(album))
}

module.exports = {
  filterUserAlbumsByTab,
  albumAwaitingOwnerConfirm,
  isAlbumRepairDoneForTab,
  REVIEW_PASSED_STATUSES,
  /** @deprecated 使用 REVIEW_PASSED_STATUSES */
  PUBLISHED_STATUSES: REVIEW_PASSED_STATUSES,
}
