const STORAGE_KEY = 'album_read_state_v1'

function getReadState() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    return raw && typeof raw === 'object' ? raw : {}
  } catch (e) {
    return {}
  }
}

function saveReadState(state) {
  try {
    wx.setStorageSync(STORAGE_KEY, state)
  } catch (e) {
    // ignore quota errors
  }
}

function normalizeUpdatedAt(value) {
  if (!value) return ''
  return String(value)
}

function toCompareTime(value) {
  if (value == null || value === '') return 0
  const s = String(value).trim()
  if (/^\d+$/.test(s)) return Number(s)
  const t = new Date(s).getTime()
  return Number.isNaN(t) ? 0 : t
}

function markAlbumSeen(albumId, updatedAt) {
  const id = String(albumId || '').trim()
  if (!id) return
  const state = getReadState()
  const stamp = normalizeUpdatedAt(updatedAt)
  state[id] = stamp || String(Date.now())
  saveReadState(state)
  notifyAlbumReadStateChanged()
}

function notifyAlbumReadStateChanged() {
  try {
    const pages = getCurrentPages()
    pages.forEach((page) => {
      if (!page || !page.route) return
      if (page.route === 'pages/album/list/index' && page._listNeedRefresh !== undefined) {
        page._listNeedRefresh = true
      }
      if (page.route === 'pages/mine/index' && typeof page.loadPage === 'function') {
        page.loadPage({ silent: true })
      }
    })
  } catch (e) {
    // ignore
  }
}

function markAlbumsSeen(albums = []) {
  const state = getReadState()
  albums.forEach((item) => {
    const id = String((item && item.albumId) || (item && item.id) || '').trim()
    if (!id) return
    state[id] = normalizeUpdatedAt(item.updatedAt) || String(Date.now())
  })
  saveReadState(state)
}

function isAlbumUnread(item, state = getReadState()) {
  const id = String((item && item.albumId) || (item && item.id) || '').trim()
  if (!id) return false
  const updatedAt = toCompareTime(item.updatedAt)
  const seenAt = toCompareTime(state[id])
  if (!seenAt) return true
  if (updatedAt && updatedAt > seenAt) return true
  return false
}

/** 菜单红点：仅统计维修中且有内容更新的相册（不含待授权） */
function hasUnreadAlbumUpdates(albums = []) {
  const state = getReadState()
  return albums.some((item) => {
    const status = item && item.status
    if (status && ['completed', 'published'].includes(String(status))) return false
    return isAlbumUnread(item, state)
  })
}

function hasUnreadAlbums(albums = []) {
  return hasUnreadAlbumUpdates(albums)
}

module.exports = {
  markAlbumSeen,
  markAlbumsSeen,
  hasUnreadAlbums,
  hasUnreadAlbumUpdates,
  isAlbumUnread,
}
