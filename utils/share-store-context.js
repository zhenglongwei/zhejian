/**
 * 分享链路单店隔离上下文（DS-A-09～11）
 * 商家分享相册/门店后，全程锁定 storeId，隐藏跨店发现模块。
 */
const { markMerchantToolEntry } = require('./tool-entry-context')

const MERCHANT_SHARE_FROM = 'merchant_share'
const TOOL_HOME_PATH = '/pages/home/index'

function getAppSafe() {
  try {
    return getApp()
  } catch (e) {
    return null
  }
}

function getShareStoreContext() {
  const app = getAppSafe()
  return (app && app.globalData && app.globalData.shareStoreContext) || {}
}

function markShareStoreContext({ storeId, source, albumId } = {}) {
  markMerchantToolEntry(source || 'share')
  const app = getAppSafe()
  if (!app) return
  const prev = getShareStoreContext()
  app.globalData.shareStoreContext = {
    isolated: true,
    storeId: storeId || prev.storeId || '',
    albumId: albumId || prev.albumId || '',
    source: source || prev.source || 'share',
    at: Date.now(),
  }
}

function isTruthyIsolatedFlag(value) {
  return value === '1' || value === 'true' || value === true
}

function isMerchantShareQuery(options = {}) {
  return options.from === MERCHANT_SHARE_FROM || isTruthyIsolatedFlag(options.isolated)
}

function isShareStoreIsolated(options) {
  if (options && isMerchantShareQuery(options)) return true
  if (options && options.storeId && isMerchantShareQuery(options)) return true
  return getShareStoreContext().isolated === true
}

function getShareStoreId(options) {
  if (options && options.storeId) return String(options.storeId)
  const ctx = getShareStoreContext()
  return ctx.storeId ? String(ctx.storeId) : ''
}

function appendQuery(url, key, value) {
  if (value == null || value === '') return url
  const sep = url.indexOf('?') >= 0 ? '&' : '?'
  return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
}

function withStoreContextPath(path, params = {}) {
  if (!path) return path
  let url = path
  const storeId = params.storeId || getShareStoreId()
  const forceIsolated =
    params.isolated === true ||
    (params.isolated !== false && (isShareStoreIsolated(params) || isShareStoreIsolated()))

  if (storeId && !/[?&]storeId=/.test(url)) {
    url = appendQuery(url, 'storeId', storeId)
  }
  if (forceIsolated && !/[?&]from=/.test(url)) {
    url = appendQuery(url, 'from', MERCHANT_SHARE_FROM)
  }
  return url
}

function navigateWithStoreContext(path, params = {}) {
  wx.navigateTo({ url: withStoreContextPath(path, params) })
}

/**
 * 页面 onLoad 解析并写入单店上下文
 * @param {Record<string, string>} options
 * @param {{ storeId?: string, albumId?: string, source?: string, autoIsolate?: boolean }} hints
 */
function resolvePageShareContext(options = {}, hints = {}) {
  const storeId = options.storeId || hints.storeId || ''
  const albumId = options.albumId || options.id || hints.albumId || ''
  const merchantShare = isMerchantShareQuery(options)
  const autoIsolate = hints.autoIsolate === true

  if (merchantShare || autoIsolate) {
    markShareStoreContext({
      storeId,
      albumId,
      source: hints.source || (merchantShare ? MERCHANT_SHARE_FROM : hints.source || 'deeplink'),
    })
    return {
      isolated: true,
      storeId: storeId || getShareStoreId(),
    }
  }

  return {
    isolated: isShareStoreIsolated(),
    storeId: getShareStoreId() || storeId,
  }
}

function filterCasesByStore(cases, storeId) {
  if (!storeId || !Array.isArray(cases)) return cases || []
  return cases.filter((item) => item && item.storeId === storeId)
}

function buildStoreScopedListPath(listKey, storeId) {
  const sid = storeId || getShareStoreId()
  if (!sid) return ''
  const paths = {
    case: '/pages/case/index',
    service: '/pages/service/index',
  }
  const base = paths[listKey]
  if (!base) return ''
  return withStoreContextPath(`${base}?storeId=${encodeURIComponent(sid)}`, {
    storeId: sid,
    isolated: true,
  })
}

module.exports = {
  MERCHANT_SHARE_FROM,
  TOOL_HOME_PATH,
  markShareStoreContext,
  getShareStoreContext,
  isShareStoreIsolated,
  getShareStoreId,
  withStoreContextPath,
  navigateWithStoreContext,
  resolvePageShareContext,
  filterCasesByStore,
  buildStoreScopedListPath,
}
