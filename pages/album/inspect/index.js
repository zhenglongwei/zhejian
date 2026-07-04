const { fetchServiceAlbum } = require('../../../services/service-album')
const { enrichServiceAlbumListItem } = require('../../../utils/service-album-display')
const { buildAlbumInspectionView } = require('../../../utils/album-inspection-view')
const { fetchAlbumInspectionAdvice } = require('../../../services/album-inspection')
const {
  AI_INSPECTION_DISCLAIMER,
  AI_INSPECTION_CONSENT,
} = require('../../../constants/album-evidence-guide')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    albumTitle: '',
    storeName: '',
    disclaimer: '',
    sections: [],
    ruleHints: [],
    showPartVerifyEntry: false,
    aiAdvice: null,
    aiAdviceVisible: false,
    aiLoading: false,
    aiDisclaimer: AI_INSPECTION_DISCLAIMER,
    compareStageHeightPx: 360,
  },

  onLoad(options) {
    this.albumId = options.albumId || ''
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '相册信息缺失' })
      return
    }
    this.loadInspection()
  },

  onReady() {
    this.updateCompareLayout()
  },

  updateCompareLayout() {
    try {
      const sys = wx.getSystemInfoSync()
      const height = Math.max(280, Math.round((sys.windowWidth || 375) * 0.72))
      this.setData({ compareStageHeightPx: height })
    } catch (e) {
      this.setData({ compareStageHeightPx: 360 })
    }
  },

  async loadInspection() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const detail = await fetchServiceAlbum(this.albumId)
      const enriched = enrichServiceAlbumListItem({
        ...detail,
        id: detail.albumId,
      })
      const view = buildAlbumInspectionView(enriched)
      this.setData({
        status: 'normal',
        albumTitle: enriched.serviceName || '服务相册',
        storeName: (enriched.store && enriched.store.name) || detail.storeName || '',
        disclaimer: view.disclaimer,
        sections: view.sections,
        ruleHints: view.ruleHints,
        showPartVerifyEntry: view.showPartVerifyEntry,
        aiAdvice: null,
        aiAdviceVisible: false,
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onRetry() {
    this.loadInspection()
  },

  onPreviewImage(e) {
    const { url, urls } = e.currentTarget.dataset
    const list = (urls || []).filter(Boolean)
    if (!url || !list.length) return
    wx.previewImage({ current: url, urls: list })
  },

  onOpenPartVerify() {
    wx.navigateTo({ url: `/pages/album/part-verify/index?albumId=${this.albumId}` })
  },

  onOpenFeedback() {
    wx.navigateTo({ url: `/pages/album/feedback/index?albumId=${this.albumId}` })
  },

  onContactStore() {
    wx.showToast({ title: '请通过门店电话或到店沟通', icon: 'none' })
  },

  onGenerateAiAdvice() {
    if (this.data.aiLoading) return
    wx.showModal({
      title: '生成智能建议',
      content: AI_INSPECTION_CONSENT,
      confirmText: '继续',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        this.runAiAdvice()
      },
    })
  },

  async runAiAdvice() {
    this.setData({ aiLoading: true })
    try {
      const advice = await fetchAlbumInspectionAdvice(this.albumId)
      this.setData({
        aiAdvice: advice,
        aiAdviceVisible: true,
        aiLoading: false,
      })
    } catch (e) {
      this.setData({ aiLoading: false })
      if (e && e.code === 'NOT_READY') {
        wx.showToast({ title: e.message, icon: 'none', duration: 3000 })
        return
      }
      wx.showToast({ title: (e && e.message) || '生成失败', icon: 'none' })
    }
  },
})
