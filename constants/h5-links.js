const { ENV } = require('../services/config')

/** 辙见 H5 内容站根 URL（公开案例 / 门店 / GEO） */
const H5_CONTENT_SITE_URL = (ENV.baseUrl || 'https://geo.simplewin.cn').replace(/\/$/, '')

const H5_CONTENT_SITE_HINT = '链接已复制，请在浏览器中打开'

const H5_CONTENT_SITE_WEBVIEW_PATH = '/pages/web/h5-site/index'

function copyH5ContentSiteLink() {
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data: H5_CONTENT_SITE_URL,
      success: () => {
        wx.showToast({ title: H5_CONTENT_SITE_HINT, icon: 'none', duration: 2500 })
        resolve(H5_CONTENT_SITE_URL)
      },
      fail: reject,
    })
  })
}

/** 优先 web-view 打开，失败则复制链接（DS-A-06） */
function openH5ContentSite() {
  const encoded = encodeURIComponent(H5_CONTENT_SITE_URL)
  wx.navigateTo({
    url: `${H5_CONTENT_SITE_WEBVIEW_PATH}?url=${encoded}`,
    fail: () => {
      copyH5ContentSiteLink().catch(() => {
        wx.showToast({ title: '打开失败，请稍后重试', icon: 'none' })
      })
    },
  })
}

module.exports = {
  H5_CONTENT_SITE_URL,
  H5_CONTENT_SITE_HINT,
  H5_CONTENT_SITE_WEBVIEW_PATH,
  copyH5ContentSiteLink,
  openH5ContentSite,
}
