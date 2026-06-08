/**
 * 工具首页入口上下文 · 控制 H5 公开案例推荐展示
 * 规则：仅「公域搜索冷启动 + 无相册绑定 + 从未商家扫码/相册码」时展示
 */
const STORAGE_MERCHANT_TOOL = 'tool_entry_merchant_v1'

/** 扫码 / 小程序码 / 分享卡片等商家私域入口 */
const MERCHANT_LAUNCH_SCENES = new Set([
  1007, 1008, 1036, 1044, 1047, 1048, 1049, 1011, 1012, 1013, 1154, 1155,
])

/** 微信搜索 / 发现冷启动（公域） */
const PUBLIC_SEARCH_LAUNCH_SCENES = new Set([1001, 1005, 1006, 1026, 1053])

function hasMerchantToolEntryFlag() {
  try {
    return !!wx.getStorageSync(STORAGE_MERCHANT_TOOL)
  } catch (e) {
    return false
  }
}

function markMerchantToolEntry(reason) {
  try {
    wx.setStorageSync(STORAGE_MERCHANT_TOOL, {
      at: Date.now(),
      reason: reason || 'unknown',
    })
  } catch (e) {
    // ignore
  }
  const app = getApp()
  if (app && app.globalData) {
    app.globalData.toolEntryContext = {
      ...(app.globalData.toolEntryContext || {}),
      merchantToolEntry: true,
      fromPublicSearch: false,
    }
  }
}

function hasMerchantDeepLink(options = {}) {
  const query = options.query || {}
  const path = String(options.path || '')
  if (query.albumId || query.album_id) return true
  if (query.scene && /alb_/i.test(String(query.scene))) return true
  if (/pages\/album\//.test(path)) return true
  if (query.id && /pages\/(store|case)\/detail/.test(path)) return true
  return false
}

function isMerchantLaunchScene(scene) {
  return MERCHANT_LAUNCH_SCENES.has(Number(scene))
}

function isPublicSearchLaunchScene(scene) {
  return PUBLIC_SEARCH_LAUNCH_SCENES.has(Number(scene))
}

/**
 * App onLaunch：记录本次冷启动是否公域搜索入口
 * @param {WechatMiniprogram.App.LaunchShowOption} options
 */
function recordAppLaunchEntry(options = {}) {
  const scene = Number(options.scene || 0)

  if (isMerchantLaunchScene(scene) || hasMerchantDeepLink(options)) {
    markMerchantToolEntry('launch')
  }

  const fromPublicSearch =
    !hasMerchantToolEntryFlag() &&
    isPublicSearchLaunchScene(scene) &&
    !hasMerchantDeepLink(options)

  return {
    scene,
    fromPublicSearch,
    merchantToolEntry: hasMerchantToolEntryFlag(),
  }
}

function getToolEntryContext() {
  const app = getApp()
  return (app && app.globalData && app.globalData.toolEntryContext) || {}
}

/**
 * 是否展示「前往辙见内容站」推荐
 * @param {{ hasAlbumBindings?: boolean }} params
 */
function shouldShowH5PublicCaseLink(params = {}) {
  const { hasAlbumBindings = false } = params

  if (hasMerchantToolEntryFlag()) return false
  if (hasAlbumBindings) return false

  const ctx = getToolEntryContext()
  return ctx.fromPublicSearch === true
}

module.exports = {
  markMerchantToolEntry,
  hasMerchantToolEntryFlag,
  recordAppLaunchEntry,
  shouldShowH5PublicCaseLink,
  isPublicSearchLaunchScene,
  isMerchantLaunchScene,
}
