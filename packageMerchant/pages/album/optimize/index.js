const {
  fetchMerchantAlbumContentOptimize,
  generateMerchantAlbumContentOptimize,
  applyMerchantAlbumContentOptimize,
} = require('../../../../services/merchant-service-album')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')

function normalizeOptimizePreview(raw) {
  if (!raw) return null
  if (raw.geoQuality && raw.aiSummaryPreview !== undefined) {
    return {
      aiSummaryPreview: raw.aiSummaryPreview,
      geo: raw.geo || raw.geoPreview,
      geoQuality: raw.geoQuality,
    }
  }
  return {
    aiSummaryPreview: raw.aiSummaryPreview,
    geo: raw.geoPreview,
    geoQuality: raw.geoQuality,
  }
}

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    capability: null,
    preview: null,
    draft: null,
    generating: false,
    applying: false,
  },

  onLoad(options) {
    this.albumId = options.albumId || ''
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '服务相册信息缺失' })
      return
    }
    this.initPage()
  },

  async initPage() {
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
      this.setData({ status: 'error', errorMessage: '请先完成商家入驻' })
      return
    }
    await this.loadPanel()
  },

  async loadPanel() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const panel = await fetchMerchantAlbumContentOptimize(this.albumId)
      if (panel.isAuthorized) {
        this.setData({
          status: 'error',
          errorMessage: '车主已授权，内容已锁定，无法再优化',
        })
        return
      }
      this.setData({
        status: 'normal',
        albumId: this.albumId,
        capability: panel.capability || null,
        preview: normalizeOptimizePreview(panel.preview),
        draft: panel.draft || null,
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onRetry() {
    this.loadPanel()
  },

  async onGenerate() {
    if (this.data.generating) return
    this.setData({ generating: true })
    try {
      const result = await generateMerchantAlbumContentOptimize(this.albumId)
      this.setData({
        draft: result.draft || null,
        capability: result.capability || this.data.capability,
        preview: normalizeOptimizePreview(result.preview),
      })
      wx.showToast({ title: '已生成建议', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '生成失败', icon: 'none' })
    } finally {
      this.setData({ generating: false })
    }
  },

  async onApply() {
    if (this.data.applying || !this.data.draft) return
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '采用优化建议',
        content: '将把建议文案写入相册节点说明，可在编辑页继续修改后保存。',
        success: (res) => resolve(Boolean(res.confirm)),
      })
    })
    if (!confirmed) return

    this.setData({ applying: true })
    try {
      const result = await applyMerchantAlbumContentOptimize(this.albumId)
      this.setData({ draft: result.draft || this.data.draft })
      wx.showToast({ title: '已写入相册', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 600)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '采用失败', icon: 'none' })
    } finally {
      this.setData({ applying: false })
    }
  },
})
