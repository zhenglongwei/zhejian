const { H5_CONTENT_SITE_URL } = require('../../../constants/h5-links')

Page({
  data: {
    url: '',
    loadError: false,
  },

  onLoad(options) {
    const raw = options.url ? decodeURIComponent(options.url) : H5_CONTENT_SITE_URL
    const url = String(raw || '').trim()
    if (!url) {
      this.setData({ loadError: true })
      return
    }
    this.setData({ url })
  },

  onWebViewError() {
    this.setData({ loadError: true })
  },

  onCopyLink() {
    const { url } = this.data
    if (!url) return
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({ title: '链接已复制，请在浏览器打开', icon: 'none' })
      },
    })
  },

  onBackHome() {
    wx.switchTab({ url: '/pages/home/index' })
  },
})
