const { BIZ_TYPE, LIABILITY_COPY } = require('../../../constants/desensitize')
const {
  fetchTask,
  runAutoMask,
  retryAsset,
  confirmOrderAuthorizeTask,
  markAssetPreviewed,
} = require('../../../services/desensitize')
const { submitAlbumAuthorization } = require('../../../services/order-album')
const { submitOrderPublicCaseReview } = require('../../../services/public-case')
const { mapTaskToWorkbenchState } = require('../../../utils/desensitize-workbench-display')

Page({
  data: {
    status: 'loading',
    taskId: '',
    albumId: '',
    orderId: '',
    fromPreMask: false,
    workbenchItems: [],
    stats: { total: 0, processed: 0, failed: 0 },
    canConfirm: false,
    liabilityText: '',
    liabilityAccepted: false,
    confirmLabelShort: '确认并公开',
    needPreviewHint: false,
    errorMessage: '',
    autoMaskLoading: false,
    confirmLoading: false,
  },

  onLoad(query) {
    wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    const taskId = (query && query.taskId) || ''
    const albumId = (query && query.albumId) || ''
    const orderId = (query && query.orderId) || ''
    const fromPreMask = query && query.fromPreMask === '1'
    const copy = LIABILITY_COPY[BIZ_TYPE.ORDER_AUTHORIZE]
    this.setData({
      taskId,
      albumId,
      orderId,
      fromPreMask,
      liabilityText: copy.body,
      confirmLabelShort: '确认并公开',
    })
    if (!taskId) {
      this.setData({
        status: 'error',
        errorMessage: '缺少脱敏任务',
      })
      return
    }
    this.loadTask()
  },

  async loadTask() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const task = await fetchTask(this.data.taskId)
      this.applyTask(task)
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  applyTask(task) {
    const view = mapTaskToWorkbenchState(task)
    this.setData({
      workbenchItems: view.workbenchItems,
      stats: view.stats,
      canConfirm: view.canConfirm,
      needPreviewHint: view.needPreviewHint,
      fromPreMask: this.data.fromPreMask || Boolean(task.fromPreMask),
      status: view.pageStatus,
    })
  },

  onRetryLoad() {
    this.loadTask()
  },

  onBackAlbum() {
    const { orderId } = this.data
    if (orderId) {
      wx.redirectTo({ url: `/pages/order/album/index?orderId=${orderId}` })
      return
    }
    wx.navigateBack()
  },

  onLiabilityChange(e) {
    this.setData({ liabilityAccepted: !!(e.detail && e.detail.accepted) })
  },

  async onPreview(e) {
    const { id, url, type } = e.detail || {}
    if (!url) return
    if (id && this.data.taskId) {
      try {
        const task = await markAssetPreviewed(this.data.taskId, id)
        this.applyTask(task)
      } catch (err) {
        // 预览不阻断
      }
    }
    const urls = (this.data.workbenchItems || [])
      .map((item) => (type === 'raw' ? item.rawUrl : item.maskedUrl))
      .filter(Boolean)
    wx.previewImage({
      current: url,
      urls: urls.length ? urls : [url],
    })
  },

  async onAutoMask() {
    if (this.data.autoMaskLoading) return
    this.setData({ autoMaskLoading: true })
    try {
      const task = await runAutoMask(this.data.taskId)
      this.applyTask(task)
      wx.showToast({ title: '脱敏完成', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '脱敏失败', icon: 'none' })
    } finally {
      this.setData({ autoMaskLoading: false })
    }
  },

  onManualMask() {
    wx.showToast({
      title: '手工打码即将开放，请先用一键 AI 脱敏',
      icon: 'none',
    })
  },

  async onRetryAsset(e) {
    const assetId = e.detail && e.detail.assetId
    if (!assetId) return
    try {
      const task = await retryAsset(this.data.taskId, assetId)
      this.applyTask(task)
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '重试失败', icon: 'none' })
    }
  },

  async onConfirm() {
    if (this.data.confirmLoading) return
    if (!this.data.liabilityAccepted) {
      wx.showToast({ title: '请勾选确认项', icon: 'none' })
      return
    }
    if (!this.data.canConfirm) {
      if (this.data.needPreviewHint) {
        wx.showToast({ title: '请先查看每张脱敏预览', icon: 'none' })
      } else {
        wx.showToast({ title: '请先完成全部图片脱敏', icon: 'none' })
      }
      return
    }
    this.setData({ confirmLoading: true })
    try {
      await confirmOrderAuthorizeTask(this.data.taskId, {
        liabilityAccepted: true,
      })
      await submitAlbumAuthorization(this.data.albumId, { agreed: true })
      if (this.data.orderId) {
        await submitOrderPublicCaseReview({
          orderId: this.data.orderId,
          albumId: this.data.albumId,
          taskId: this.data.taskId,
        })
      }
      wx.showToast({ title: '已确认公开', icon: 'success' })
      setTimeout(() => {
        this.onBackAlbum()
      }, 700)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '提交失败', icon: 'none' })
    } finally {
      this.setData({ confirmLoading: false })
    }
  },
})
