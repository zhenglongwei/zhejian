const {
  H5_CONTENT_SITE_URL,
  H5_WEB_COPY_HINT,
  stripMiniappEmbedParam,
  copyMerchantCaseH5Link,
} = require('../../../constants/h5-links')
const { reLaunchAppHome } = require('../../../utils/app-home')

Page({
  data: {
    url: '',
    shareUrl: '',
    loadError: false,
    merchantCaseFallback: false,
    caseId: '',
  },

  onLoad(options) {
    this.pageOptions = options || {}
    const raw = options.url ? decodeURIComponent(options.url) : H5_CONTENT_SITE_URL
    const url = String(raw || '').trim()
    const shareUrl = stripMiniappEmbedParam(url)
    const caseId = String(options.caseId || '').trim()
    const merchantCaseFallback =
      options.fallback === 'merchantCase' && Boolean(caseId)

    this.caseId = caseId
    this.merchantCaseFallback = merchantCaseFallback

    if (!url) {
      this.handleLoadFailure()
      return
    }

    this.setData({
      url,
      shareUrl,
      caseId,
      merchantCaseFallback,
      loadError: false,
    })
  },

  handleLoadFailure() {
    this.setData({ loadError: true, merchantCaseFallback: this.merchantCaseFallback })
  },

  onWebViewError() {
    this.handleLoadFailure()
  },

  copyCurrentWebLink() {
    const { shareUrl, url, caseId, merchantCaseFallback } = this.data
    const target = shareUrl || stripMiniappEmbedParam(url)
    if (!target && !(merchantCaseFallback && caseId)) {
      wx.showToast({ title: '链接不可用', icon: 'none' })
      return Promise.resolve(false)
    }
    if (merchantCaseFallback && caseId) {
      return copyMerchantCaseH5Link({ caseId, h5Url: target }).catch(() => {
        wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' })
        return false
      })
    }
    return new Promise((resolve) => {
      wx.setClipboardData({
        data: target,
        success: () => {
          wx.showToast({ title: H5_WEB_COPY_HINT, icon: 'none', duration: 2800 })
          resolve(true)
        },
        fail: () => {
          wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' })
          resolve(false)
        },
      })
    })
  },

  onCopyLink() {
    this.copyCurrentWebLink()
  },

  onCopyWebLinkTap() {
    this.copyCurrentWebLink()
  },

  onBackHome() {
    reLaunchAppHome()
  },
})
