const { BIZ_TYPE, LIABILITY_COPY } = require('../../../constants/desensitize')
const {
  fetchTask,
  runAutoMask,
  retryAsset,
  confirmOrderAuthorizeTask,
  markAssetPreviewed,
  excludeAuthorizeAsset,
} = require('../../../services/desensitize')
const { submitAlbumAuthorization } = require('../../../services/order-album')
const { submitServiceAlbumAuthorization } = require('../../../services/service-album')
const {
  submitOrderPublicCaseReview,
  submitServicePublicCaseReview,
} = require('../../../services/public-case')
const {
  isGeoEvidenceIncompleteError,
  showGeoEvidenceIncompleteModal,
} = require('../../../utils/geo-evidence-prompt')
const { mapTaskToWorkbenchState } = require('../../../utils/desensitize-workbench-display')
const { fetchServiceAlbum } = require('../../../services/service-album')
const { buildAlbumAiSummary } = require('../../../utils/album-ai-summary')

Page({
  data: {
    status: 'loading',
    taskId: '',
    albumId: '',
    orderId: '',
    source: 'order',
    fromPreMask: false,
    isDraftOnly: false,
    workbenchItems: [],
    stats: { total: 0, processed: 0, failed: 0 },
    canConfirm: false,
    liabilityText: '',
    liabilityAccepted: false,
    policyLinkText: '',
    confirmLabelShort: '确认发布到公开网站',
    needPreviewHint: false,
    publicViewHint: '',
    publicMediaCount: 0,
    hasRepairPlanText: false,
    errorMessage: '',
    autoMaskLoading: false,
    confirmLoading: false,
    aiSummary: '',
    caseDraftTitle: '',
    caseDraftSummary: '',
    caseDraftSections: [],
    caseDraftMedia: [],
    caseDraftMissing: false,
  },

  onLoad(query) {
    wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    const taskId = (query && query.taskId) || ''
    const albumId = (query && query.albumId) || ''
    const orderId = (query && query.orderId) || ''
    const albumTitle = decodeURIComponent((query && query.albumTitle) || '')
    const source = (query && query.source) || (orderId ? 'order' : 'service')
    const fromPreMask = query && query.fromPreMask === '1'
    const isReviewPreview = source === 'review'
    const isDraftOnly = source === 'service'
    const copyKey = isReviewPreview
      ? BIZ_TYPE.SERVICE_REVIEW_PREVIEW
      : source === 'service'
        ? BIZ_TYPE.SERVICE_AUTHORIZE
        : BIZ_TYPE.ORDER_AUTHORIZE
    const copy = LIABILITY_COPY[copyKey] || LIABILITY_COPY[BIZ_TYPE.SERVICE_AUTHORIZE]
    const showPolicyLink = !isReviewPreview
    wx.setNavigationBarTitle({
      title: isReviewPreview ? '评价配图预览' : isDraftOnly ? '预览案例文案' : '脱敏预览',
    })
    this.setData({
      taskId,
      albumId,
      orderId,
      source,
      fromPreMask,
      isDraftOnly,
      authTier: 'named',
      albumTitle,
      liabilityText: copy.body,
      policyLinkText: showPolicyLink ? '《公开案例与隐私说明》' : '',
      confirmLabelShort: copy.confirmLabel || '确认发布到公开网站',
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
      if (this.data.source === 'service' && this.data.albumId) {
        const album = await fetchServiceAlbum(this.data.albumId)
        if (album.caseVisibleToOwner === false || album.complianceStatus !== 'passed') {
          this.setData({
            status: 'error',
            errorMessage: album.compliancePendingHint || '门店案例审核中，通过后方可预览与发布',
            caseDraftMissing: true,
          })
          return
        }
        this._authorizeAlbum = album
      }
      const [task, aiSummary] = await Promise.all([
        fetchTask(this.data.taskId),
        this.loadAuthorizeAiSummary(),
      ])
      this.applyTask(task, aiSummary)
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  async loadAuthorizeAiSummary() {
    const { source, albumId } = this.data
    if (source === 'review' || source !== 'service' || !albumId) return ''
    try {
      const album = this._authorizeAlbum || (await fetchServiceAlbum(albumId))
      const draft = album.merchantCaseDraft || null
      // 案例审已通过 ⇒ 产品上必已确认案例稿；仅当稿体完全缺失时视为异常
      const reviewPassed =
        album.caseVisibleToOwner === true || album.complianceStatus === 'passed'
      const hasDraft = Boolean(draft && (draft.confirmedAt || reviewPassed))
      if (!hasDraft) {
        this.setData({
          caseDraftMissing: true,
          caseDraftTitle: '',
          caseDraftSummary: '',
          caseDraftSections: [],
          caseDraftMedia: [],
        })
        return ''
      }
      const sections = (draft.sections || []).filter((s) => String(s.body || '').trim())
      const { draftToAiSummary } = require('../../../utils/merchant-case-draft-display')
      const caseDraftSummary = draft.caseSummary || draftToAiSummary(draft) || ''
      this.setData({
        caseDraftMissing: false,
        caseDraftTitle: draft.title || '',
        caseDraftSummary,
        caseDraftSections: sections,
        caseDraftMedia: [],
      })
      if (album.merchantCaseDraftSummary) return album.merchantCaseDraftSummary
      return caseDraftSummary
    } catch (e) {
      return ''
    }
  },

  onCopyCaseDraft() {
    const { draftToPlainText } = require('../../../utils/merchant-case-draft-display')
    const text = draftToPlainText({
      title: this.data.caseDraftTitle,
      caseSummary: this.data.caseDraftSummary,
      sections: this.data.caseDraftSections,
    })
    if (!text) {
      wx.showToast({ title: '暂无可复制文案', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制文案', icon: 'success' }),
    })
  },

  applyTask(task, aiSummary = '') {
    const isDraftOnly = this.data.source === 'service'
    if (isDraftOnly) {
      this.setData({
        isDraftOnly: true,
        workbenchItems: [],
        stats: { total: 0, processed: 0, failed: 0 },
        canConfirm: true,
        needPreviewHint: false,
        fromPreMask: this.data.fromPreMask || Boolean(task && task.fromPreMask),
        publicViewHint: '',
        publicMediaCount: 0,
        hasRepairPlanText: Boolean(task && task.hasRepairPlanText),
        status: 'normal',
        aiSummary: aiSummary || this.data.aiSummary,
      })
      this._loaded = true
      return
    }
    const allowExclude =
      this.data.source === 'service' || this.data.source === 'order'
    const view = mapTaskToWorkbenchState(task, { allowExclude })
    const publicMediaCount = Number.isFinite(Number(task.publicMediaCount))
      ? Number(task.publicMediaCount)
      : (task.rawAssets || []).length
    const hasRepairPlanText = Boolean(task.hasRepairPlanText)
    const publicViewHint = task.publicViewHint || ''
    this.setData({
      isDraftOnly: false,
      workbenchItems: view.workbenchItems,
      stats: view.stats,
      canConfirm: view.canConfirm,
      needPreviewHint: view.needPreviewHint,
      fromPreMask: this.data.fromPreMask || Boolean(task.fromPreMask),
      publicViewHint,
      publicMediaCount,
      hasRepairPlanText,
      status: view.pageStatus,
      aiSummary: aiSummary || this.data.aiSummary,
    })
    this._loaded = true
  },

  onConsentToggle() {
    this.setData({ liabilityAccepted: !this.data.liabilityAccepted })
  },

  onRetryLoad() {
    this.loadTask()
  },

  onBackAlbum() {
    const { orderId, albumId, source, albumTitle } = this.data
    if (source === 'review' && albumId) {
      wx.redirectTo({
        url:
          `/pages/album/engage/index?albumId=${encodeURIComponent(albumId)}` +
          (albumTitle ? `&albumTitle=${encodeURIComponent(albumTitle)}` : ''),
      })
      return
    }
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

  onOpenPolicy() {
    wx.navigateTo({ url: '/pages/benefit-sharing/index' })
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

  async onExcludeAsset(e) {
    const assetId = e.detail && e.detail.assetId
    if (!assetId || !this.data.taskId) return
    if (this.data.source === 'review') {
      wx.showToast({ title: '评价配图请在评价页调整', icon: 'none' })
      return
    }
    try {
      const res = await new Promise((resolve) => {
        wx.showModal({
          title: '不公开此图',
          content: '将从即将上网的配图中移除（相册留档仍在）。不可再自行加回，需门店重新选图后完工。',
          confirmText: '移除',
          success: resolve,
        })
      })
      if (!res.confirm) return
      const task = await excludeAuthorizeAsset(this.data.taskId, assetId)
      this.applyTask(task)
      wx.showToast({ title: '已移出公开包', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '移除失败', icon: 'none' })
    }
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
    if (this.data.source === 'service' && this.data.caseDraftMissing) {
      wx.showToast({ title: '案例稿暂时无法加载', icon: 'none' })
      return
    }
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
      if (this.data.source === 'review') {
        wx.showToast({ title: '已确认评价配图', icon: 'success', duration: 2000 })
        setTimeout(() => {
          this.onBackAlbum()
        }, 2000)
        return
      }
      if (this.data.source === 'service') {
        await submitServiceAlbumAuthorization(this.data.albumId, {
          agreed: true,
          tier: 'named',
        })
        const result = await submitServicePublicCaseReview({
          albumId: this.data.albumId,
          taskId: this.data.taskId,
        })
        const autoApproved =
          (result && result.autoApproved) ||
          (result && result.status === 'public_approved')
        wx.showToast({
          title: autoApproved
            ? (result && result.message) || '已发布到公开网站'
            : (result && result.message) || '已提交审核，通过后将自动展示',
          icon: 'success',
          duration: 2000,
        })
        setTimeout(() => {
          this.onBackAlbum()
        }, 2000)
        return
      }
      await submitAlbumAuthorization(this.data.albumId, { agreed: true })
      if (this.data.orderId) {
        await submitOrderPublicCaseReview({
          orderId: this.data.orderId,
          albumId: this.data.albumId,
          taskId: this.data.taskId,
        })
      }
      wx.showToast({ title: '已提交审核，通过后将自动展示', icon: 'success', duration: 2000 })
      setTimeout(() => {
        this.onBackAlbum()
      }, 2000)
    } catch (e) {
      if (this.data.source !== 'service' && isGeoEvidenceIncompleteError(e)) {
        await showGeoEvidenceIncompleteModal(e, { audience: 'user' })
      } else {
        wx.showToast({ title: (e && e.message) || '提交失败', icon: 'none' })
      }
    } finally {
      this.setData({ confirmLoading: false })
    }
  },
})
