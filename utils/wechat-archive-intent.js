/**
 * 官网「微信转案例」扫码意图：未开通先去工作台，开通完送回整理页。
 */

const STORAGE_KEY = 'zj_wechat_archive_intent_v1'
const WECHAT_ARCHIVE_URL = '/packageMerchant/pages/tools/wechat-archive/index'
const WORKBENCH_URL = '/packageMerchant/pages/workbench/index'

function markWechatArchiveIntent() {
  try {
    wx.setStorageSync(STORAGE_KEY, { at: Date.now() })
  } catch (e) {
    // ignore
  }
}

function hasWechatArchiveIntent() {
  try {
    return Boolean(wx.getStorageSync(STORAGE_KEY))
  } catch (e) {
    return false
  }
}

function consumeWechatArchiveIntent() {
  try {
    wx.removeStorageSync(STORAGE_KEY)
  } catch (e) {
    // ignore
  }
}

function redirectToWechatArchive() {
  wx.redirectTo({ url: WECHAT_ARCHIVE_URL })
}

function redirectToWorkbenchForArchive() {
  markWechatArchiveIntent()
  wx.redirectTo({ url: WORKBENCH_URL })
}

module.exports = {
  WECHAT_ARCHIVE_URL,
  WORKBENCH_URL,
  markWechatArchiveIntent,
  hasWechatArchiveIntent,
  consumeWechatArchiveIntent,
  redirectToWechatArchive,
  redirectToWorkbenchForArchive,
}
