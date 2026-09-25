/**
 * 隐私授权。
 * 进车主首页或商家首页时先问一次；已同意则选图、选地址不再弹。
 * 登录弹层上的 agreePrivacyAuthorization 与这里是同一次微信同意。
 */

const HOME_PRIVACY_COPY = {
  title: '隐私保护提示',
  description: '继续使用前，请先阅读并同意。',
}

/** 首页提示一次即可，避免每次 onShow 都查一次设置 */
let homePrompted = false

function queryPrivacySetting() {
  return new Promise((resolve) => {
    if (typeof wx.getPrivacySetting !== 'function') {
      resolve({ needAuthorization: false })
      return
    }
    wx.getPrivacySetting({
      success: resolve,
      fail: () => resolve({ needAuthorization: false }),
    })
  })
}

/**
 * @param {object} popup 页面内 privacy-authorize-popup 组件实例（仅作兜底）
 * @returns {Promise<boolean>} 是否已可调用隐私接口
 */
function requestPrivacyAuthorization(popup) {
  return queryPrivacySetting().then((setting) => {
    if (!setting.needAuthorization) return true

    return new Promise((resolve) => {
      const app = getApp()
      let settled = false
      const finish = (agreed) => {
        if (settled) return
        settled = true
        resolve(!!agreed)
      }

      const showPopup = (target) => {
        if (!target || typeof target.show !== 'function') {
          // 没地方弹窗时也要说清楚，不能静默失败
          if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
            wx.showToast({ title: '请先同意《用户隐私保护指引》', icon: 'none' })
          }
          finish(false)
          return
        }
        target.show({
          title: '需要位置权限',
          description: '你尚未完成隐私接口授权。请退出后重新登录并同意协议，或在此确认后继续。',
          onResult: finish,
        })
      }

      if (popup) {
        showPopup(popup)
        return
      }

      if (app && app.privacyPopup) {
        showPopup(app.privacyPopup)
        return
      }

      finish(false)
    })
  })
}

/**
 * 首页进入时：尚未同意隐私指引则弹出。已同意则什么都不做。
 * @param {WechatMiniprogram.Page.TrivialInstance} page 须包含 #privacyAuthorizePopup
 */
function promptHomePrivacy(page) {
  if (!page || homePrompted) return
  const run = () => {
    queryPrivacySetting().then((setting) => {
      if (!setting.needAuthorization) {
        homePrompted = true
        return
      }
      const popup = page.selectComponent && page.selectComponent('#privacyAuthorizePopup')
      if (!popup || typeof popup.show !== 'function') return
      if (popup.data && popup.data.visible) return
      const app = getApp()
      if (app) app.privacyPopup = popup
      homePrompted = true
      popup.show(HOME_PRIVACY_COPY)
    })
  }
  if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
    wx.nextTick(run)
    return
  }
  setTimeout(run, 0)
}

module.exports = {
  queryPrivacySetting,
  requestPrivacyAuthorization,
  promptHomePrivacy,
}
