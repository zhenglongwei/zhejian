const { BIZ_TYPE, LIABILITY_COPY } = require('../../../../constants/desensitize')
const {
  fetchTask,
  runAutoMask,
  retryAsset,
  confirmOrderAuthorizeTask,
  markAssetPreviewed,
} = require('../../../../services/desensitize')
const { submitMerchantPublicCase, fetchMerchantAlbumGeoPreview } = require('../../../../services/merchant-service-album')
const { mapTaskToWorkbenchState } = require('../../../../utils/desensitize-workbench-display')
const {
  buildGeoEvidenceMerchantContent,
  isGeoEvidenceIncompleteError,
  showGeoEvidenceIncompleteModal,
} = require('../../../../utils/geo-evidence-prompt')

Page({
  data: {
    status: 'loading',
    taskId: '',
    albumId: '',
    from: '',
    fromPreMask: false,
    bizType: BIZ_TYPE.MERCHANT_HISTORY,
    workbenchItems: [],
    stats: { total: 0, processed: 0, failed: 0 },
    canConfirm: false,
    liabilityText: '',
    liabilityAccepted: false,
    confirmLabel: '确认脱敏结果并提交审核',
    confirmLabelShort: '确认并提交',
    needPreviewHint: false,
    geoQuality: null,
    geoBlockHint: '',
    geoBlocked: false,
    errorMessage: '',
    autoMaskLoading: false,
    confirmLoading: false,
  },

  onLoad(query) {
    const taskId = (query && query.taskId) || ''
    const albumId = (query && query.albumId) || ''
    const bizType = (query && query.bizType) || BIZ_TYPE.MERCHANT_HISTORY
    const copy = LIABILITY_COPY[bizType] || LIABILITY_COPY[BIZ_TYPE.MERCHANT_HISTORY]
    this.setData({
      taskId,
      albumId,
      from: (query && query.from) || '',
      fromPreMask: query && query.fromPreMask === '1',
      bizType,
      liabilityText: copy.body,
      confirmLabel: copy.confirmLabel,
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
    if (albumId && bizType === BIZ_TYPE.MERCHANT_HISTORY) {
      this.loadGeoPreview()
    }
  },

  onShow() {
    if (this._loaded && this.data.taskId) {
      this.loadTask()
      if (this.data.albumId && this.data.bizType === BIZ_TYPE.MERCHANT_HISTORY) {
        this.loadGeoPreview()
      }
    }
  },

  async loadGeoPreview() {
    if (!this.data.albumId) return
    try {
      const preview = await fetchMerchantAlbumGeoPreview(this.data.albumId)
      const geoQuality = preview.geoQuality || null
      const missingFields = (geoQuality && geoQuality.missingFields) || []
      const geoBlockHint = buildGeoEvidenceMerchantContent(missingFields)
      const geoBlocked = geoQuality && geoQuality.level === 'block'
      this.setData({
        geoQuality,
        geoBlockHint,
        geoBlocked,
      })
    } catch (e) {
      // 预览失败不阻断脱敏核对
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
    this._task = task
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

  onBackEdit() {
    const albumId = this.data.albumId
    if (albumId) {
      wx.redirectTo({
        url: `/packageMerchant/pages/album/edit/index?albumId=${albumId}`,
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
    if (this.data.geoBlocked) {
      wx.showModal({
        title: '暂无法提交',
        content: this.data.geoBlockHint || buildGeoEvidenceMerchantContent(),
        showCancel: false,
        confirmText: '返回编辑',
        success: (res) => {
          if (res.confirm) this.onBackEdit()
        },
      })
      return
    }
    if (!this.data.liabilityAccepted) {
      wx.showToast({ title: '请勾选责任确认', icon: 'none' })
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
      if (this.data.bizType === BIZ_TYPE.MERCHANT_HISTORY && this.data.albumId) {
        await submitMerchantPublicCase(this.data.albumId, {
          taskId: this.data.taskId,
        })
      }
      wx.showToast({ title: '已提交审核', icon: 'success' })
      setTimeout(() => {
        if (this.data.from === 'album_edit') {
          wx.redirectTo({
            url: `/packageMerchant/pages/album/edit/index?albumId=${this.data.albumId}&refresh=1`,
          })
        } else if (this.data.from === 'album_create') {
          wx.navigateBack({ delta: 2 })
        } else {
          wx.redirectTo({ url: '/packageMerchant/pages/album/list/index' })
        }
      }, 700)
    } catch (e) {
      if (isGeoEvidenceIncompleteError(e)) {
        const res = await showGeoEvidenceIncompleteModal(e, {
          audience: 'merchant',
          confirmText: '返回编辑',
        })
        if (res.confirm) this.onBackEdit()
      } else {
        wx.showToast({ title: (e && e.message) || '提交失败', icon: 'none' })
      }
    } finally {
      this.setData({ confirmLoading: false })
    }
  },
})
