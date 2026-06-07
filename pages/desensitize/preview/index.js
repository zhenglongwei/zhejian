const { BIZ_TYPE, LIABILITY_COPY } = require('../../../constants/desensitize')
const {
  fetchTask,
  runAutoMask,
  retryAsset,
  confirmOrderAuthorizeTask,
  markAssetPreviewed,
} = require('../../../services/desensitize')
const { submitAlbumAuthorization } = require('../../../services/order-album')
const { submitServiceAlbumAuthorization } = require('../../../services/service-album')
const {
  submitOrderPublicCaseReview,
  submitServicePublicCaseReview,
} = require('../../../services/public-case')
const { mapTaskToWorkbenchState } = require('../../../utils/desensitize-workbench-display')

Page({
  data: {
    status: 'loading',
    taskId: '',
    albumId: '',
    orderId: '',
    source: 'order',
    fromPreMask: false,
    workbenchItems: [],
    stats: { total: 0, processed: 0, failed: 0 },
    canConfirm: false,
    liabilityText: '',
    liabilityAccepted: false,
    confirmLabelShort: '确认授权公示',
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
    const source = (query && query.source) || (orderId ? 'order' : 'service')
    const fromPreMask = query && query.fromPreMask === '1'
    const authTier = query && query.tier === 'anonymous' ? 'anonymous' : 'named'
    const copyKey =
      source === 'service' ? BIZ_TYPE.SERVICE_AUTHORIZE : BIZ_TYPE.ORDER_AUTHORIZE
    const copy = LIABILITY_COPY[copyKey]
    this.setData({
      taskId,
      albumId,
      orderId,
      source,
      fromPreMask,
      authTier,
      liabilityText: copy.body,
      confirmLabelShort: '确认授权公示',
    })
    if (!taskId) {
      this.setData({
        status: 'error',
        errorMessage: '缺少脱敏任务',
      })
      return
    }
    this._loaded = false
    this.loadTask()
  },

  onShow() {
    if (this._loaded && this.data.taskId) {
      this.loadTask()
    }
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
    this._loaded = true
  },

  onRetryLoad() {
    this.loadTask()
  },

  onBackAlbum() {
    const { orderId, albumId, source } = this.data
    if (source === 'service' && albumId) {
      wx.redirectTo({ url: `/pages/album/detail/index?albumId=${albumId}` })
      return
    }
    if (orderId) {
      wx.redirectTo({
        url: `/pages/album/detail/index?albumId=${encodeURIComponent(`alb_${orderId}`)}`,
      })
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
    if (type === 'masked' && id && this.data.taskId) {
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

  onManualMask(e) {
    const assetId = e.detail && e.detail.assetId
    if (assetId) {
      this.goMaskEditor(assetId)
      return
    }
    const candidates = (this.data.workbenchItems || []).filter((i) => i.showManualMask)
    if (!candidates.length) {
      wx.showToast({ title: '暂无可用图片', icon: 'none' })
      return
    }
    if (candidates.length === 1) {
      this.goMaskEditor(candidates[0].id)
      return
    }
    const failed = candidates.filter((c) => c.tagVariant === 'warning')
    const list = failed.length ? failed : candidates
    wx.showActionSheet({
      itemList: list.map((c) => c.nodeTitle || '过程图'),
      success: (res) => {
        if (list[res.tapIndex]) {
          this.goMaskEditor(list[res.tapIndex].id)
        }
      },
    })
  },

  onManualMaskItem(e) {
    this.onManualMask(e)
  },

  goMaskEditor(assetId) {
    const { taskId, albumId } = this.data
    wx.navigateTo({
      url:
        `/pages/desensitize/mask/index?taskId=${encodeURIComponent(taskId)}` +
        `&assetId=${encodeURIComponent(assetId)}` +
        (albumId ? `&albumId=${encodeURIComponent(albumId)}` : ''),
      events: {
        maskUpdated: () => {
          this.loadTask()
        },
      },
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
      wx.showToast({ title: '请先完成全部图片脱敏', icon: 'none' })
      return
    }
    this.setData({ confirmLoading: true })
    try {
      await confirmOrderAuthorizeTask(this.data.taskId, {
        liabilityAccepted: true,
      })
      if (this.data.source === 'service') {
        await submitServiceAlbumAuthorization(this.data.albumId, {
          agreed: true,
          tier: this.data.authTier,
        })
        await submitServicePublicCaseReview({
          albumId: this.data.albumId,
          taskId: this.data.taskId,
        })
      } else {
        await submitAlbumAuthorization(this.data.albumId, { agreed: true })
        if (this.data.orderId) {
          await submitOrderPublicCaseReview({
            orderId: this.data.orderId,
            albumId: this.data.albumId,
            taskId: this.data.taskId,
          })
        }
      }
      wx.showToast({ title: '已授权公示，审核通过后将自动展示', icon: 'success' })
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
