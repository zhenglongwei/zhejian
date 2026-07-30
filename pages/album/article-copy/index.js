const { ENV } = require('../../../services/config')
const {
  buildDraftArticleExport,
  buildDraftArticleSectionsView,
} = require('../../../utils/merchant-case-draft-article')
const { fetchServiceAlbum } = require('../../../services/service-album')

Page({
  data: {
    status: 'loading',
    albumId: '',
    errorMessage: '',
    title: '',
    summary: '',
    sections: [],
    html: '',
    copying: false,
  },

  onLoad(query) {
    const albumId = (query && query.albumId) || ''
    this.setData({ albumId })
    if (!albumId) {
      this.setData({ status: 'error', errorMessage: '缺少相册信息' })
      return
    }
    this.loadArticle(albumId)
  },

  async loadArticle(albumId) {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const album = await fetchServiceAlbum(albumId)
      const draft = album && album.merchantCaseDraft
      if (!draft) {
        this.setData({ status: 'error', errorMessage: '案例稿暂不可用' })
        return
      }
      const publicBaseUrl = String(ENV.baseUrl || '').replace(/\/$/, '')
      const exported = buildDraftArticleExport(draft, { publicBaseUrl })
      const sections = buildDraftArticleSectionsView(draft, { publicBaseUrl })
      this.setData({
        status: 'normal',
        title: exported.title || '',
        summary: String(draft.caseSummary || '').trim(),
        sections,
        html: exported.html || '',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onPreviewImage(e) {
    const url = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.url
    if (!url) return
    const urls = []
    ;(this.data.sections || []).forEach((sec) => {
      ;(sec.images || []).forEach((img) => {
        if (img && img.url) urls.push(img.url)
      })
    })
    wx.previewImage({
      current: url,
      urls: urls.length ? urls : [url],
    })
  },

  onCopyArticle() {
    const html = this.data.html
    if (!html || this.data.copying) return
    this.setData({ copying: true })
    wx.setClipboardData({
      data: html,
      success: () => {
        wx.showModal({
          title: '已复制图文',
          content:
            '已复制带排版与脱敏图片的文章。请打开公众号、知乎、头条等编辑器直接粘贴；图片为网络地址，粘贴后会自动加载。',
          showCancel: false,
          confirmText: '知道了',
        })
      },
      fail: () => {
        wx.showToast({ title: '复制失败，请重试', icon: 'none' })
      },
      complete: () => {
        this.setData({ copying: false })
      },
    })
  },

  onBack() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/mine/index' }),
    })
  },
})
