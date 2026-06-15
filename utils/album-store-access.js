/**
 * 门店/案例/服务深链准入 · 单店隔离 + 公域只读访客态
 *
 * - 未绑定任何服务相册：可读公开门店/案例/服务（public_guest，利于分享与搜一搜直达）
 * - 已绑定相册：仅可访问相册关联门店；商家分享链仍可按上下文打开
 */
const { fetchUserServiceAlbums } = require('../services/service-album')
const { checkAuth } = require('./auth')
const {
  getShareStoreContext,
  isMerchantShareQuery,
  markShareStoreContext,
  withStoreContextPath,
} = require('./share-store-context')

const ALBUM_OWNER_FROM = 'album_owner'
const ALBUM_OWNER_SOURCES = new Set(['album_detail', 'album_list', 'album_owner'])

const ACCESS_DENIED_MESSAGE =
  '仅可查看与您服务相册相关的门店内容，请从「我的服务相册」进入。'

const ISOLATED_ACCESS_MODES = new Set([
  'merchant_share',
  'context',
  'album_owner',
])

function isAlbumOwnerScope(options = {}) {
  if (options.from === ALBUM_OWNER_FROM) return true
  const ctx = getShareStoreContext()
  return ALBUM_OWNER_SOURCES.has(ctx.source)
}

function collectStoreIdsFromAlbums(albums) {
  const ids = new Set()
  ;(albums || []).forEach((item) => {
    const sid = item.storeId || (item.store && item.store.id) || ''
    if (sid) ids.add(String(sid))
  })
  return ids
}

async function fetchUserAlbumStoreIds() {
  if (!checkAuth({ needPhone: false })) return new Set()
  try {
    const [privateList, publicList] = await Promise.all([
      fetchUserServiceAlbums({ tab: 'private' }),
      fetchUserServiceAlbums({ tab: 'public' }),
    ])
    return collectStoreIdsFromAlbums([
      ...(privateList || []),
      ...(publicList || []),
    ])
  } catch (e) {
    return new Set()
  }
}

async function userHasBoundAlbum() {
  const ids = await fetchUserAlbumStoreIds()
  return ids.size > 0
}

async function userOwnsStoreAlbum(storeId) {
  if (!storeId) return false
  const ids = await fetchUserAlbumStoreIds()
  return ids.has(String(storeId))
}

/**
 * 是否处于单店隔离 UI（隐藏跨店模块、过滤相关案例等）
 * @param {{ mode?: string, allowed?: boolean }} access assertOwnerStoreAccess 返回值
 * @param {boolean} [extraIsolated] 页面已有 isolated 标记（分享上下文等）
 */
function isStoreContextIsolated(access, extraIsolated = false) {
  if (extraIsolated) return true
  if (!access || !access.allowed) return false
  return ISOLATED_ACCESS_MODES.has(access.mode)
}

/**
 * @param {string} storeId
 * @param {Record<string, string>} [options] 页面 onLoad options
 * @returns {Promise<{ allowed: boolean, reason?: string, mode?: string }>}
 */
async function assertOwnerStoreAccess(storeId, options = {}) {
  if (!storeId) {
    return { allowed: false, reason: '门店不存在' }
  }
  if (options.preview === '1' || options.preview === 'true') {
    return { allowed: true, mode: 'preview' }
  }
  if (isMerchantShareQuery(options)) {
    return { allowed: true, mode: 'merchant_share' }
  }

  const ctx = getShareStoreContext()
  if (ctx.isolated && ctx.storeId && String(ctx.storeId) === String(storeId)) {
    return { allowed: true, mode: 'context' }
  }

  const albumStoreIds = await fetchUserAlbumStoreIds()
  if (albumStoreIds.size === 0) {
    return { allowed: true, mode: 'public_guest' }
  }

  if (albumStoreIds.has(String(storeId))) {
    markShareStoreContext({
      storeId: String(storeId),
      source: 'album_owner',
      isolated: true,
    })
    return { allowed: true, mode: 'album_owner' }
  }

  return { allowed: false, reason: ACCESS_DENIED_MESSAGE }
}

function buildOwnerStoreDetailPath(storeId) {
  return withStoreContextPath(
    `/pages/store/detail/index?id=${encodeURIComponent(storeId)}&from=${ALBUM_OWNER_FROM}`,
    { storeId: String(storeId), isolated: true }
  )
}

function navigateToOwnerStoreDetail(storeId) {
  const sid = String(storeId || '').trim()
  if (!sid) {
    wx.showToast({ title: '暂无关联门店', icon: 'none' })
    return
  }
  markShareStoreContext({
    storeId: sid,
    source: 'album_owner',
    isolated: true,
  })
  wx.navigateTo({
    url: buildOwnerStoreDetailPath(sid),
    fail: () => {
      wx.showToast({ title: '无法打开门店页', icon: 'none' })
    },
  })
}

module.exports = {
  ALBUM_OWNER_FROM,
  ACCESS_DENIED_MESSAGE,
  isAlbumOwnerScope,
  assertOwnerStoreAccess,
  buildOwnerStoreDetailPath,
  navigateToOwnerStoreDetail,
  userOwnsStoreAlbum,
  userHasBoundAlbum,
  fetchUserAlbumStoreIds,
  isStoreContextIsolated,
}
