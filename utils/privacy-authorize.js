/**
 * 隐私授权 — 调用 chooseLocation 等隐私接口前使用
 * 登录页 agreePrivacyAuthorization 已同步时，此处会直接通过
 */
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

module.exports = {
  queryPrivacySetting,
  requestPrivacyAuthorization,
}
