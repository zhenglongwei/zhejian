const {
  H5_CONTENT_SITE_URL,
  MERCHANT_CASE_H5_COPY_HINT,
  parseCaseIdFromH5Url,
  redirectMerchantCasePreview,
  copyMerchantCaseH5Link,
} = require('../../../constants/h5-links')
const { reLaunchAppHome } = require('../../../utils/app-home')

Page({
  data: {
    url: '',
    loadError: false,
    merchantCaseFallback: false,
    caseId: '',
  },

  onLoad(options) {
    this.pageOptions = options || {}
    const raw = options.url ? decodeURIComponent(options.url) : H5_CONTENT_SITE_URL
    const url = String(raw || '').trim()
    const caseId = String(options.caseId || parseCaseIdFromH5Url(url) || '').trim()
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
      caseId,
      merchantCaseFallback,
      loadError: false,
    })
  },

  async handleLoadFailure() {
    if (this.merchantCaseFallback && this.caseId) {
      const redirected = await redirectMerchantCasePreview(this.caseId)
      if (redirected) return
    }
    this.setData({ loadError: true, merchantCaseFallback: this.merchantCaseFallback })
  },

  onWebViewError() {
    this.handleLoadFailure()
  },

  onCopyLink() {
    const { url, caseId, merchantCaseFallback } = this.data
    if (merchantCaseFallback && caseId) {
      copyMerchantCaseH5Link({ caseId, h5Url: url }).catch(() => {
        wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' })
      })
      return
    }
    if (!url) return
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({ title: '链接已复制，请在浏览器打开', icon: 'none' })
      },
    })
  },

  async onOpenMerchantCasePreview() {
    if (!this.caseId) return
    const opened = await redirectMerchantCasePreview(this.caseId)
    if (!opened) {
      wx.showToast({ title: '打开失败，请稍后重试', icon: 'none' })
    }
  },

  onBackHome() {
    reLaunchAppHome()
  },
})
