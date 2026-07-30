const { ENV } = require('../../../services/config')
const { buildDraftArticleExport } = require('../../../utils/merchant-case-draft-article')
const { fetchServiceAlbum } = require('../../../services/service-album')

Page({
  data: {
    status: 'loading',
    albumId: '',
    webviewUrl: '',
    errorMessage: '',
    fallbackHtml: '',
  },

  onLoad(query) {
    const albumId = (query && query.albumId) || ''
    this.setData({ albumId })
    if (!albumId) {
      this.setData({ status: 'error', errorMessage: '缺少相册信息' })
      return
    }
    this.openClipboardPage(albumId)
  },

  async openClipboardPage(albumId) {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      if (ENV.mode === 'mock') {
        await this.prepareMockFallback(albumId)
        return
      }
      const token = wx.getStorageSync('token') || ''
      if (!token) {
        this.setData({ status: 'error', errorMessage: '请先登录后再复制' })
        return
      }
      const base = String(ENV.baseUrl || '').replace(/\/$/, '')
      const apiVersion = ENV.apiVersion || 'v1'
      const webviewUrl =
        `${base}/api/${apiVersion}/user/service-albums/${encodeURIComponent(albumId)}` +
        `/draft-article-clipboard?access_token=${encodeURIComponent(token)}`
      this.setData({ status: 'normal', webviewUrl })
    } catch (e) {
      try {
        await this.prepareMockFallback(albumId)
      } catch (err) {
        this.setData({
          status: 'error',
          errorMessage: (e && e.message) || '无法打开复制页',
        })
      }
    }
  },

  async prepareMockFallback(albumId) {
    const album = await fetchServiceAlbum(albumId)
    const draft = album && album.merchantCaseDraft
    if (!draft) {
      this.setData({ status: 'error', errorMessage: '案例稿暂不可用' })
      return
    }
    const exported = buildDraftArticleExport(draft, {
      publicBaseUrl: String(ENV.baseUrl || '').replace(/\/$/, ''),
    })
    this.setData({
      status: 'error',
      errorMessage:
        '当前环境无法打开图文剪贴板页。可先复制 HTML，再到公众号等编辑器粘贴。',
      fallbackHtml: exported.html || '',
    })
  },

  onFallbackCopy() {
    const data = this.data.fallbackHtml
    if (!data) {
      wx.showToast({ title: '暂无内容', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data,
      success: () => {
        wx.showToast({ title: 'HTML 已复制', icon: 'success' })
      },
    })
  },
})
