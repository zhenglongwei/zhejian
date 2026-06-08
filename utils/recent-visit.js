/**
 * 工具首页 · 最近查看（DS-A-05）
 * 仅保留 1 条 localStorage 记录，不展示跨店列表。
 */
const { withStoreContextPath } = require('./share-store-context')

const STORAGE_KEY = 'tool_recent_visit_v1'

function recordRecentVisit(record = {}) {
  const storeId = record.storeId ? String(record.storeId) : ''
  const albumId = record.albumId ? String(record.albumId) : ''
  if (!storeId && !albumId) return

  const type = record.type || (albumId ? 'album' : 'store')
  const payload = {
    type,
    storeId,
    albumId,
    storeName: String(record.storeName || '').trim(),
    serviceName: String(record.serviceName || '').trim(),
    visitedAt: Date.now(),
  }

  try {
    wx.setStorageSync(STORAGE_KEY, payload)
  } catch (e) {
    // ignore
  }
}

function getRecentVisit() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    if (!raw || typeof raw !== 'object') return null
    if (!raw.storeId && !raw.albumId) return null
    return raw
  } catch (e) {
    return null
  }
}

function buildRecentVisitLabel(record) {
  if (!record) return ''
  const name = record.storeName || '门店'
  if (record.type === 'album') {
    const service = record.serviceName ? ` · ${record.serviceName}` : ''
    return `最近查看：${name}${service} · 继续查看`
  }
  return `最近查看：${name} · 继续查看`
}

function buildRecentVisitPath(record) {
  if (!record) return ''
  if (record.type === 'album' && record.albumId) {
    return withStoreContextPath(
      `/pages/album/detail/index?albumId=${encodeURIComponent(record.albumId)}`,
      { storeId: record.storeId, isolated: true }
    )
  }
  if (record.storeId) {
    return withStoreContextPath(
      `/pages/store/detail/index?id=${encodeURIComponent(record.storeId)}`,
      { storeId: record.storeId, isolated: true }
    )
  }
  return ''
}

module.exports = {
  recordRecentVisit,
  getRecentVisit,
  buildRecentVisitLabel,
  buildRecentVisitPath,
}
