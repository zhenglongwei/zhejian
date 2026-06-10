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

function buildStoreListH5Url() {
  return `${H5_CONTENT_SITE_URL}/store/`
}

function buildStoreH5Url({ storeId } = {}) {
  if (!storeId) return ''
  return `${H5_CONTENT_SITE_URL}/store/${encodeURIComponent(storeId)}.html`
}

function buildStoreCasesH5Url({ storeId } = {}) {
  if (!storeId) return buildCaseListH5Url()
  return `${H5_CONTENT_SITE_URL}/store/${encodeURIComponent(storeId)}/cases`
}

/** GEO 专题 H5 URL（DS-D-07：公域主战场在 H5 /topic/{slug}） */
function buildGeoTopicH5Url({ slug, id, h5Path } = {}) {
  if (h5Path) {
    const path = String(h5Path).startsWith('/') ? h5Path : `/${h5Path}`
    return `${H5_CONTENT_SITE_URL}${path}`
  }
  const topicSlug = slug || (id && !String(id).startsWith('geo_') ? id : '')
  if (topicSlug) {
    return `${H5_CONTENT_SITE_URL}/topic/${encodeURIComponent(topicSlug)}`
  }
  return ''
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

/**
 * 通用 H5 web-view 打开（DS-D-04～06 公域列表下线）
 * @param {string} url
 * @param {{ redirect?: boolean }} options
 */
function openH5Url(url, options = {}) {
  const target = String(url || '').trim()
  if (!target) {
    wx.showToast({ title: '链接不可用', icon: 'none' })
    return Promise.resolve(false)
  }
  const encoded = encodeURIComponent(target)
  const webviewUrl = `${H5_CONTENT_SITE_WEBVIEW_PATH}?url=${encoded}`
  const opener = options.redirect ? wx.redirectTo : wx.navigateTo
  return new Promise((resolve) => {
    opener({
      url: webviewUrl,
      fail: () => {
        copyTextToClipboard(target, H5_CONTENT_SITE_HINT)
          .then(() => resolve(true))
          .catch(() => {
            wx.showToast({ title: '打开失败，请稍后重试', icon: 'none' })
            resolve(false)
          })
      },
      success: () => resolve(true),
    })
  })
}

/**
 * 打开 GEO 专题 H5（DS-D-07）
 * @param {string|{ slug?, id?, h5Path? }} params
 * @param {{ redirect?: boolean }} options redirect=true 时替换当前页（深链兼容页）
 */
function openGeoTopicH5(params = {}, options = {}) {
  const url = typeof params === 'string' ? params : buildGeoTopicH5Url(params)
  if (!url) {
    wx.showToast({ title: '专题链接不可用', icon: 'none' })
    return Promise.resolve(false)
  }
  return openH5Url(url, options)
}

module.exports = {
  H5_CONTENT_SITE_URL,
  H5_CONTENT_SITE_HINT,
  H5_CASE_LINK_HINT,
  H5_CONTENT_SITE_WEBVIEW_PATH,
  buildCaseH5Url,
  buildCaseListH5Url,
  buildStoreListH5Url,
  buildStoreH5Url,
  buildStoreCasesH5Url,
  buildGeoTopicH5Url,
  copyH5ContentSiteLink,
  copyCaseH5Link,
  copyCaseListH5Link,
  openH5ContentSite,
  openH5Url,
  openGeoTopicH5,
}
