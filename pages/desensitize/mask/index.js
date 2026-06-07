const { fetchTask, applyManualMask } = require('../../../services/desensitize')

Page({
  data: {
    status: 'loading',
    taskId: '',
    assetId: '',
    albumId: '',
    imageUrl: '',
    nodeTitle: '',
    mode: 'mosaic',
    submitting: false,
    errorMessage: '',
  },

  onLoad(query) {
    wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    const taskId = (query && query.taskId) || ''
    const assetId = (query && query.assetId) || ''
    const albumId = (query && query.albumId) || ''
    this.setData({ taskId, assetId, albumId })
    if (!taskId || !assetId) {
      this.setData({
        status: 'error',
        errorMessage: '缺少任务或图片参数',
      })
      return
    }
    this.loadAsset()
  },

  async loadAsset() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const task = await fetchTask(this.data.taskId)
      const asset = (task.rawAssets || []).find((a) => a.id === this.data.assetId)
      if (!asset) {
        this.setData({
          status: 'error',
          errorMessage: '图片不存在或已移除',
        })
        return
      }
      const imageUrl = asset.maskedUrl || asset.url
      if (!imageUrl) {
        this.setData({
          status: 'error',
          errorMessage: '暂无可用图片',
        })
        return
      }
      wx.setNavigationBarTitle({
        title: asset.nodeTitle ? `手工打码 · ${asset.nodeTitle}` : '手工打码',
      })
      this.setData({
        imageUrl,
        nodeTitle: asset.nodeTitle || '过程图',
        status: 'normal',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onRetryLoad() {
    this.loadAsset()
  },

  async onSubmit(e) {
    if (this.data.submitting) return
    const { regions, mode } = e.detail || {}
    if (!regions || !regions.length) {
      wx.showToast({ title: '请先框选打码区域', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      await applyManualMask(this.data.taskId, this.data.assetId, {
        regions,
        mode: mode || 'mosaic',
      })
      wx.showToast({ title: '打码已应用', icon: 'success' })
      const channel = this.getOpenerEventChannel && this.getOpenerEventChannel()
      if (channel && channel.emit) {
        channel.emit('maskUpdated')
      }
      setTimeout(() => wx.navigateBack(), 500)
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '打码失败', icon: 'none' })
      this.setData({ submitting: false })
    }
  },
})
