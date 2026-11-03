/**
 * 隐私授权。
 * 启动身份页确认一次；已同意则选图、选地址不再弹。
 * 车主首页 / 商家工作台不主动弹。
 * 登录弹层上的 agreePrivacyAuthorization 与这里是同一次微信同意。
 */

const HOME_PRIVACY_COPY = {
  title: '隐私保护提示',
  description: '继续使用前，请先阅读并同意。',
}

const LOCATION_PRIVACY_COPY = {
  title: '需要位置权限',
  description: '选点前请先同意《用户隐私保护指引》。',
}

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
 * @param {{ title?: string, description?: string }} [copy]
 * @returns {Promise<boolean>} 是否已可调用隐私接口
 */
function requestPrivacyAuthorization(popup, copy = {}) {
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
          title: copy.title || HOME_PRIVACY_COPY.title,
          description: copy.description || HOME_PRIVACY_COPY.description,
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
 * 身份页选商家/车主时：若微信还要授权，在本页弹完再登录。
 * @param {WechatMiniprogram.Page.TrivialInstance} page 须包含 #privacyAuthorizePopup
 * @returns {Promise<boolean>}
 */
function authorizeOnRolePage(page) {
  const popup = page && page.selectComponent && page.selectComponent('#privacyAuthorizePopup')
  return requestPrivacyAuthorization(popup, HOME_PRIVACY_COPY).then((agreed) => {
    if (!agreed) return false
    const app = typeof getApp === 'function' ? getApp() : null
    if (app && typeof app.markConsentApproved === 'function') {
      app.markConsentApproved()
    }
    return true
  })
}

module.exports = {
  HOME_PRIVACY_COPY,
  LOCATION_PRIVACY_COPY,
  queryPrivacySetting,
  requestPrivacyAuthorization,
  authorizeOnRolePage,
}
