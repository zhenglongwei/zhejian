const { BIZ_TYPE, LIABILITY_COPY } = require('../../../constants/desensitize')
const { splitConsentWithPolicyLink } = require('../../../constants/compliance-copy')
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
const { buildOwnerSharePayload } = require('../../../utils/album-owner-share')

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
    liabilityTextAfter: '',
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
    shareSheetVisible: false,
    aiSummary: '',
    caseDraftTitle: '',
    caseDraftSummary: '',
    caseDraftSections: [],
    caseDraftMedia: [],
    caseDraftMissing: false,
    detail: null,
  },

  onLoad(query) {
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
    const consentParts = splitConsentWithPolicyLink(copy.body, showPolicyLink)
    wx.setNavigationBarTitle({
      title: isReviewPreview ? '评价配图预览' : isDraftOnly ? '预览案例文案' : '脱敏预览',
    })
    if (isDraftOnly) {
      wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    } else {
      wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    }
    this.setData({
      taskId,
      albumId,
      orderId,
      source,
      fromPreMask,
      isDraftOnly,
      authTier: 'named',
      albumTitle,
      liabilityText: consentParts.before,
      liabilityTextAfter: consentParts.after,
      policyLinkText: consentParts.link,
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
        if (album.complianceStatus !== 'passed') {
          this.setData({
            status: 'error',
            errorMessage: album.compliancePendingHint || '门店案例审核中，通过后方可预览与发布',
            caseDraftMissing: true,
          })
          return
        }
        this._authorizeAlbum = album
        this.setData({ detail: album })
      }
      // 先拉任务再组案例稿：配图需用脱敏任务资产回填 maskedUrl
      const task = await fetchTask(this.data.taskId)
      const aiSummary = await this.loadAuthorizeAiSummary(task)
      this.applyTask(task, aiSummary)
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  resolveDraftMediaDisplayUrl(item, task) {
    const { resolveMediaUrl } = require('../../../utils/desensitize-url')
    const pick = (url) => {
      const raw = String(url || '').trim()
      if (!raw) return ''
      return resolveMediaUrl(raw) || raw
    }
    const masked = pick(item && item.maskedUrl)
    if (masked) return masked
    const assets = (task && task.rawAssets) || []
    const nodeId = String((item && item.nodeId) || '')
    const idx = Number((item && item.idx) || 0)
    let hit = assets.find(
      (a) => String(a.nodeId || '') === nodeId && Number(a.idx != null ? a.idx : 0) === idx,
    )
    if (!hit) {
      const tip = String((item && (item.previewUrl || item.rawUrl)) || '')
      if (tip) {
        hit = assets.find((a) => String(a.rawUrl || '') === tip)
      }
    }
    const fromTask = pick(hit && (hit.maskedUrl || hit.preMaskedUrl))
    if (fromTask) return fromTask
    // 末级回退：商家确认稿里的预览位，避免有施工图却整页空白
    return pick(item && item.previewUrl)
  },

  async loadAuthorizeAiSummary(task = null) {
    const { source, albumId } = this.data
    if (source === 'review' || source !== 'service' || !albumId) return ''
    try {
      const album = this._authorizeAlbum || (await fetchServiceAlbum(albumId))
      const draft = album.merchantCaseDraft || null
      // 案例审已通过 ⇒ 产品上必已确认案例稿；仅当稿体完全缺失时视为异常
      const reviewPassed = album.complianceStatus === 'passed'
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
      const media = (draft.media || [])
        .map((m) => ({
          ...m,
          displayUrl: this.resolveDraftMediaDisplayUrl(m, task),
        }))
        .filter((m) => m.displayUrl)
      // 有配图的章节即使正文为空也要保留，否则施工过程图会被滤掉
      const sections = (draft.sections || [])
        .map((s) => ({
          ...s,
          body: String((s && s.body) || '').trim(),
        }))
        .filter(
          (s) => s.body || media.some((m) => String(m.sectionKey || '') === String(s.key || '')),
        )
      const { draftToAiSummary } = require('../../../utils/merchant-case-draft-display')
      const caseDraftSummary = draft.caseSummary || draftToAiSummary(draft) || ''
      this.setData({
        caseDraftMissing: false,
        caseDraftTitle: draft.title || '',
        caseDraftSummary,
        caseDraftSections: sections,
        caseDraftMedia: media,
      })
      if (album.merchantCaseDraftSummary) return album.merchantCaseDraftSummary
      return caseDraftSummary
    } catch (e) {
      return ''
    }
  },

  onDraftImageTap(e) {
    const url = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.url
    if (!url) return
    const urls = (this.data.caseDraftMedia || [])
      .map((m) => m.displayUrl)
      .filter(Boolean)
    wx.previewImage({
      current: url,
      urls: urls.length ? urls : [url],
    })
  },

  onCopyCaseDraft() {
    this.onOpenArticleCopy()
  },

  onOpenArticleCopy() {
    if (this.data.caseDraftMissing) {
      wx.showToast({ title: '案例稿暂时无法加载', icon: 'none' })
      return
    }
    const albumId = this.data.albumId
    if (!albumId) return
    wx.navigateTo({
      url: `/pages/album/article-copy/index?albumId=${encodeURIComponent(albumId)}`,
    })
  },

  onShareReportTap() {
    // 发布意图：勾选后主按钮直接确认上网，不再弹出渠道选择
    return this.onConfirm()
  },

  onCloseShareSheet() {
    this.setData({ shareSheetVisible: false })
  },

  onShareTimelineGuide() {
    wx.showModal({
      title: '分享到朋友圈',
      content: '请点击右上角 ···，选择「分享到朋友圈」。',
      showCancel: false,
    })
  },

  async onPublishOfficial() {
    await this.onConfirm()
  },

  onShareAppMessage() {
    const detail = this.data.detail || this._authorizeAlbum || {}
    return (
      buildOwnerSharePayload(detail) || {
        title: detail.serviceName ? `${detail.serviceName} · 服务相册` : '服务相册',
        path: `/pages/album/detail/index?albumId=${this.data.albumId}`,
      }
    )
  },

  onShareTimeline() {
    const detail = this.data.detail || this._authorizeAlbum || {}
    const payload = buildOwnerSharePayload(detail) || {}
    return {
      title: payload.title || detail.serviceName || '服务相册',
      query: `albumId=${encodeURIComponent(this.data.albumId || '')}`,
      imageUrl: payload.imageUrl || '',
    }
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
      wx.redirectTo({
        url: `/pages/album/owner-share/index?albumId=${encodeURIComponent(albumId)}`,
      })
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
        const detail = this.data.detail || this._authorizeAlbum || {}
        const publicStatus = String(detail.publicCaseStatus || '')
        if (publicStatus === 'public_approved') {
          wx.showToast({ title: '已在公开网站展示', icon: 'success' })
          setTimeout(() => {
            this.onBackAlbum()
          }, 1200)
          return
        }
        const alreadyAuthorized =
          detail.isAuthorized === true ||
          detail.authorizationStatus === 'authorized' ||
          (detail.authorization && detail.authorization.status === 'authorized')
        if (!alreadyAuthorized) {
          await submitServiceAlbumAuthorization(this.data.albumId, {
            agreed: true,
            tier: 'named',
          })
        }
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
