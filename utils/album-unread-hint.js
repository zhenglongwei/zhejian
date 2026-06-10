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

function markAlbumSeen(albumId, updatedAt) {
  const id = String(albumId || '').trim()
  if (!id) return
  const state = getReadState()
  state[id] = normalizeUpdatedAt(updatedAt) || String(Date.now())
  saveReadState(state)
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
  const updatedAt = normalizeUpdatedAt(item.updatedAt)
  const seenAt = state[id]
  if (!seenAt) return true
  if (updatedAt && updatedAt > String(seenAt)) return true
  return false
}

function hasUnreadAlbums(albums = []) {
  const state = getReadState()
  return albums.some((item) => isAlbumUnread(item, state))
}

module.exports = {
  markAlbumSeen,
  markAlbumsSeen,
  hasUnreadAlbums,
  isAlbumUnread,
}
