/**
 * 服务评价二次进入轻提示（本地记忆，可关闭）
 * 真源：docs/03_商家端/05_商家套餐与权益.md §5.1
 */

const STORAGE_PREFIX = 'zj_album_review_nudge_v1'

function storageKey(albumId) {
  return `${STORAGE_PREFIX}:${String(albumId || '').trim()}`
}

function readState(albumId) {
  if (!albumId) return { visits: 0, dismissed: false }
  try {
    const raw = wx.getStorageSync(storageKey(albumId))
    if (!raw || typeof raw !== 'object') return { visits: 0, dismissed: false }
    return {
      visits: Number(raw.visits) || 0,
      dismissed: Boolean(raw.dismissed),
    }
  } catch (e) {
    return { visits: 0, dismissed: false }
  }
}

function writeState(albumId, state) {
  if (!albumId) return
  try {
    wx.setStorageSync(storageKey(albumId), {
      visits: Number(state.visits) || 0,
      dismissed: Boolean(state.dismissed),
    })
  } catch (e) {
    // ignore
  }
}

function shouldShowAlbumReviewNudge(albumId) {
  const state = readState(albumId)
  return !state.dismissed && state.visits >= 2
}

/** 打开详情时记一次访问；返回是否应展示提示条（第 2 次起且未关闭） */
function recordAlbumReviewVisit(albumId) {
  const prev = readState(albumId)
  const visits = prev.visits + 1
  writeState(albumId, { visits, dismissed: prev.dismissed })
  return !prev.dismissed && visits >= 2
}

function dismissAlbumReviewNudge(albumId) {
  const prev = readState(albumId)
  writeState(albumId, { visits: prev.visits, dismissed: true })
}

function clearAlbumReviewNudge(albumId) {
  if (!albumId) return
  try {
    wx.removeStorageSync(storageKey(albumId))
  } catch (e) {
    // ignore
  }
}

module.exports = {
  shouldShowAlbumReviewNudge,
  recordAlbumReviewVisit,
  dismissAlbumReviewNudge,
  clearAlbumReviewNudge,
}
