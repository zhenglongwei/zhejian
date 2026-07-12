/**
 * 微信地图选点 — 入驻/门店编辑等场景共用
 * 后台须声明「收集你选择的位置信息」（与 getLocation 的「收集你的位置信息」不同）
 */
const { requestPrivacyAuthorization } = require('./privacy-authorize')

function chooseStoreLocation(options = {}, context = {}) {
  const { latitude, longitude } = options
  const { privacyPopup } = context

  return requestPrivacyAuthorization(privacyPopup).then((authorized) => {
    if (!authorized) {
      const err = new Error('privacy_not_agreed')
      err.code = 'privacy_not_agreed'
      throw err
    }

    return new Promise((resolve, reject) => {
      const params = {
        success: resolve,
        fail: reject,
      }
      if (latitude != null && longitude != null && latitude !== '' && longitude !== '') {
        params.latitude = Number(latitude)
        params.longitude = Number(longitude)
      }
      wx.chooseLocation(params)
    })
  })
}

function getChooseLocationFailMessage(err) {
  const msg = (err && err.errMsg) || ''
  if (msg.indexOf('cancel') >= 0) return ''
  if (err && err.code === 'privacy_not_agreed') return ''
  if (
    msg.indexOf('privacy agreement') >= 0 ||
    msg.indexOf('not declared') >= 0 ||
    (err && err.errno === 112)
  ) {
    return '请先在小程序后台声明「收集你选择的位置信息」并等待审核生效'
  }
  if (msg.indexOf('auth deny') >= 0) {
    return '请在系统设置中允许微信使用位置信息'
  }
  if (msg.indexOf('authorize') >= 0 || msg.indexOf('privacy') >= 0) {
    return '请先同意隐私保护指引后再选点'
  }
  return '打开地图失败，请稍后重试'
}

module.exports = {
  chooseStoreLocation,
  getChooseLocationFailMessage,
}
