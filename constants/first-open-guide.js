/**
 * 小程序首次打开短引导（可关闭）
 * 真源：12_我的页面 §3.1.6 · 12_商家工作台UI线框 §0.1
 */

const MERCHANT_FIRST_GUIDE_STORAGE = 'zj_merchant_first_guide_v1'
const OWNER_FIRST_GUIDE_STORAGE = 'zj_owner_first_guide_v1'

const MERCHANT_FIRST_GUIDE = {
  title: '先做这一单档案',
  body: '用相册记下过程。要放到公开案例站，在相册里托管并公开。',
  dismiss: '知道了',
}

const OWNER_FIRST_GUIDE = {
  title: '这里看你的维修档案',
  body: '门店给你建了相册，就能在这里翻过程。网上公开的，在公开案例站。',
  dismiss: '知道了',
}

function readGuideDismissed(key) {
  try {
    return Boolean(wx.getStorageSync(key))
  } catch (e) {
    return false
  }
}

function writeGuideDismissed(key) {
  try {
    wx.setStorageSync(key, '1')
  } catch (e) {
    // ignore
  }
}

function shouldShowMerchantFirstGuide() {
  return !readGuideDismissed(MERCHANT_FIRST_GUIDE_STORAGE)
}

function shouldShowOwnerFirstGuide() {
  return !readGuideDismissed(OWNER_FIRST_GUIDE_STORAGE)
}

function dismissMerchantFirstGuide() {
  writeGuideDismissed(MERCHANT_FIRST_GUIDE_STORAGE)
}

function dismissOwnerFirstGuide() {
  writeGuideDismissed(OWNER_FIRST_GUIDE_STORAGE)
}

module.exports = {
  MERCHANT_FIRST_GUIDE,
  OWNER_FIRST_GUIDE,
  shouldShowMerchantFirstGuide,
  shouldShowOwnerFirstGuide,
  dismissMerchantFirstGuide,
  dismissOwnerFirstGuide,
}
