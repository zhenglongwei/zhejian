const { ENV } = require('../services/config')

/** 辙见 H5 内容站根 URL（公开案例 / 门店 / GEO） */
const H5_CONTENT_SITE_URL = (ENV.baseUrl || 'https://geo.simplewin.cn').replace(/\/$/, '')

const H5_CONTENT_SITE_HINT = '链接已复制，请在浏览器中打开'
const H5_CASE_LINK_HINT = '案例链接已复制'

const H5_CONTENT_SITE_WEBVIEW_PATH = '/pages/web/h5-site/index'

function buildCaseH5Url({ slug, caseId, canonicalPath } = {}) {
  if (canonicalPath) return `${H5_CONTENT_SITE_URL}${canonicalPath}`
  if (slug) return `${H5_CONTENT_SITE_URL}/case/${encodeURIComponent(slug)}.html`
  if (caseId) {
    return `${H5_CONTENT_SITE_URL}/case/view.html?id=${encodeURIComponent(caseId)}`
  }
  return ''
}

function buildCaseListH5Url() {
  return `${H5_CONTENT_SITE_URL}/case/`
}

function copyTextToClipboard(text, hint) {
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: hint || H5_CONTENT_SITE_HINT, icon: 'none', duration: 2500 })
        resolve(text)
      },
      fail: reject,
    })
  })
}

function copyH5ContentSiteLink() {
  return copyTextToClipboard(H5_CONTENT_SITE_URL, H5_CONTENT_SITE_HINT)
}

function copyCaseH5Link(item) {
  const url =
    (item && item.h5Url) ||
    buildCaseH5Url({ slug: item && item.slug, caseId: item && item.caseId })
  if (!url) {
    wx.showToast({ title: '案例尚未发布 H5', icon: 'none' })
    return Promise.resolve('')
  }
  return copyTextToClipboard(url, H5_CASE_LINK_HINT)
}

function copyCaseListH5Link() {
  return copyTextToClipboard(buildCaseListH5Url(), H5_CONTENT_SITE_HINT)
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
  H5_CASE_LINK_HINT,
  H5_CONTENT_SITE_WEBVIEW_PATH,
  buildCaseH5Url,
  buildCaseListH5Url,
  copyH5ContentSiteLink,
  copyCaseH5Link,
  copyCaseListH5Link,
  openH5ContentSite,
}
