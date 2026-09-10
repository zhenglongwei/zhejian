const {
  fetchMerchantServiceAlbum,
  hostMerchantAlbum,
  auditHostedPublicPrivacy,
  generateHostedGeoDraft,
  confirmHostedPublicPublish,
  cancelPublicHostIntent,
  fetchHostPublicFace,
  ensureHostDesensitizeTask,
} = require('../../../../services/merchant-service-album')
const { fetchTask, runAutoMask } = require('../../../../services/desensitize')
const { SERVICE_ALBUM_STATUS } = require('../../../../constants/service-album-status')
const { BIZ_TYPE } = require('../../../../constants/desensitize')

function stripUrlQuery(url) {
  return String(url || '').trim().split('?')[0].split('#')[0]
}

function urlsLikelyMatch(a, b) {
  const x = stripUrlQuery(a)
  const y = stripUrlQuery(b)
  if (!x || !y) return false
  if (x === y) return true
  return x.endsWith(y) || y.endsWith(x)
}

/** 向导步骤：1 存档 · 2 核对公开内容 · 3 店页说明 */
function resolveWizardStep(hostMeta = {}, hostMode = 'private') {
  if (!hostMeta.hosted) return 1
  if (hostMeta.visibility === 'public') return 1
  const stage = String(hostMeta.publicPublishStage || '')
  if (!stage) return 1
  if (stage === 'awaiting_privacy') return 2
  if (stage === 'awaiting_geo' || stage === 'awaiting_geo_confirm') return 3
  if (stage === 'published') return 1
  if (hostMode === 'public') return 2
  return 1
}

Page({
  data: {
    albumId: '',
    status: 'loading',
    errorMessage: '',
    serviceName: '',
    working: false,
    hostMode: 'private',
    hosted: false,
    hostVisibility: 'private',
    publicPublishStage: '',
    wizardStep: 1,
    privacyPassed: false,
    privacyBlocks: [],
    reviewDocs: [],
    previewTexts: [],
    previewImages: [],
    previewImageCount: 0,
    geoDraft: {},
    geoSummary: '',
    geoHighlights: [],
    geoFaq: [],
    geoConfirmed: false,
  },

  onLoad(options) {
    this.albumId = String(options.albumId || '').trim()
    this.setData({ albumId: this.albumId })
    this.bootstrap()
  },

  onShow() {
    if (this.albumId && this.data.status === 'ready' && this.data.wizardStep === 2) {
      this.loadPublicFace({ silent: true })
    }
  },

  async bootstrap() {
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '缺少相册' })
      return
    }
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const album = await fetchMerchantServiceAlbum(this.albumId)
      const albumStatus = album.status || ''
      if (
        albumStatus !== SERVICE_ALBUM_STATUS.COMPLETED &&
        albumStatus !== 'published' &&
        albumStatus !== SERVICE_ALBUM_STATUS.PUBLISHED
      ) {
        this.setData({
          status: 'error',
          errorMessage: '请先完成服务流程并整单完工',
        })
        return
      }
      this.applyAlbum(album)
      if (this.data.wizardStep === 2) {
        await this.loadPublicFace({ silent: true })
      } else if (
        this.data.wizardStep === 3 &&
        this.data.privacyPassed &&
        !String(this.data.geoSummary || '').trim()
      ) {
        try {
          const res = await generateHostedGeoDraft(this.albumId)
          const draft = res.geoDraft || {}
          this.setData({
            geoDraft: draft,
            geoSummary: draft.summary || '',
            geoHighlights: Array.isArray(draft.highlights) ? draft.highlights : [],
            geoFaq: Array.isArray(draft.faq) ? draft.faq : [],
            publicPublishStage: res.publicPublishStage || 'awaiting_geo_confirm',
          })
        } catch (_) {
          /* 留空由用户点重新生成 */
        }
      }
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  applyAlbum(album) {
    const hostMeta = album.hostMeta || {}
    const stage = String(hostMeta.publicPublishStage || '')
    const geoLayer = hostMeta.geoLayer || {}
    const geoDraft = hostMeta.geoDraft || {}
    const hosted = Boolean(hostMeta.hosted)
    const visibility = hostMeta.visibility || 'private'
    const hostMode =
      hosted && (stage || visibility === 'public') ? 'public' : hosted ? 'private' : this.data.hostMode
    const wizardStep = resolveWizardStep(hostMeta, hostMode)
    this.setData({
      status: 'ready',
      serviceName: album.serviceName || '服务相册',
      hosted,
      hostVisibility: visibility,
      publicPublishStage: stage,
      hostMode: hosted ? hostMode : this.data.hostMode,
      wizardStep,
      privacyPassed: Boolean(hostMeta.privacyAuditPassedAt),
      privacyBlocks: [],
      geoDraft,
      geoSummary: geoDraft.summary || geoLayer.summary || '',
      geoHighlights: Array.isArray(geoDraft.highlights)
        ? geoDraft.highlights
        : Array.isArray(geoLayer.highlights)
          ? geoLayer.highlights
          : [],
      geoFaq: Array.isArray(geoDraft.faq)
        ? geoDraft.faq
        : Array.isArray(geoLayer.faq)
          ? geoLayer.faq
          : [],
      geoConfirmed: Boolean(geoLayer.confirmedAt) || visibility === 'public',
    })
  },

  onRetry() {
    this.bootstrap()
  },

  onSelectMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (!mode || this.data.hosted) return
    this.setData({ hostMode: mode })
  },

  async loadPublicFace(options = {}) {
    try {
      const face = await fetchHostPublicFace(this.albumId)
      this.setData({
        reviewDocs: Array.isArray(face.reviewDocs) ? face.reviewDocs : [],
        previewTexts: face.texts || [],
        previewImages: face.images || [],
        previewImageCount: face.imageCount || 0,
        privacyBlocks: face.hardBlocks || this.data.privacyBlocks,
      })
    } catch (e) {
      if (!options.silent) {
        wx.showToast({ title: (e && e.message) || '预览加载失败', icon: 'none' })
      }
    }
  },

  async onSubmitHost() {
    if (this.data.working || this.data.hosted) return
    this.setData({ working: true })
    try {
      await hostMerchantAlbum(this.albumId, {
        mode: this.data.hostMode,
        useDesensitizeTool: true,
      })
      const album = await fetchMerchantServiceAlbum(this.albumId)
      this.applyAlbum(album)
      wx.showToast({
        title: this.data.hostMode === 'public' ? '已存档，请核对内容' : '已私密存档',
        icon: 'success',
      })
      if (this.data.wizardStep === 2) {
        await this.loadPublicFace()
      }
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '托管失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  async onSwitchToPublic() {
    if (this.data.working) return
    this.setData({ working: true })
    try {
      await hostMerchantAlbum(this.albumId, { mode: 'public', useDesensitizeTool: true })
      const album = await fetchMerchantServiceAlbum(this.albumId)
      this.applyAlbum(album)
      this.setData({ hostMode: 'public' })
      await this.loadPublicFace()
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  async onCancelPublicIntent() {
    if (this.data.working) return
    const isLive = this.data.hostVisibility === 'public'
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: isLive ? '取消公开？' : '改回仅私密？',
        content: isLive
          ? '店页将不再展示本单，档案仍保留在案例站。'
          : '将清空公开进度，档案仍私密托管。',
        confirmText: isLive ? '取消公开' : '改回私密',
        success: (res) => resolve(Boolean(res.confirm)),
      })
    })
    if (!ok) return
    this.setData({ working: true })
    try {
      await cancelPublicHostIntent(this.albumId)
      const album = await fetchMerchantServiceAlbum(this.albumId)
      this.applyAlbum(album)
      this.setData({
        hostMode: 'private',
        reviewDocs: [],
        previewTexts: [],
        previewImages: [],
        privacyBlocks: [],
      })
      wx.showToast({ title: '已改回私密', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  async onOpenDesensitize() {
    if (this.data.working) return
    this.setData({ working: true })
    try {
      const res = await ensureHostDesensitizeTask(this.albumId)
      const taskId = res && res.taskId
      if (!taskId) {
        wx.showToast({ title: '脱敏任务未就绪', icon: 'none' })
        return
      }
      wx.navigateTo({
        url: `/packageMerchant/pages/desensitize/workbench/index?taskId=${encodeURIComponent(
          taskId,
        )}&albumId=${encodeURIComponent(this.albumId)}&from=host&fromPreMask=1&bizType=${encodeURIComponent(
          BIZ_TYPE.MERCHANT_HISTORY,
        )}`,
      })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '打开失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  async ensureMaskTask() {
    const res = await ensureHostDesensitizeTask(this.albumId)
    const taskId = res && res.taskId
    if (!taskId) {
      const err = new Error('脱敏任务未就绪')
      throw err
    }
    this._maskTaskId = taskId
    return taskId
  },

  async findMaskAssetId(imageUrl) {
    const taskId = await this.ensureMaskTask()
    const task = await fetchTask(taskId)
    const assets = (task && task.rawAssets) || []
    const hit = assets.find(
      (row) =>
        urlsLikelyMatch(row.url, imageUrl) ||
        urlsLikelyMatch(row.maskedUrl, imageUrl) ||
        urlsLikelyMatch(row.preMaskedUrl, imageUrl),
    )
    if (!hit) {
      const err = new Error('未找到对应过程图，请从脱敏工作台处理')
      throw err
    }
    return { taskId, assetId: hit.id }
  },

  async onReviewImageEdit(e) {
    if (this.data.working) return
    const url = e.detail && e.detail.url
    if (!url) return
    this.setData({ working: true })
    try {
      const { taskId, assetId } = await this.findMaskAssetId(url)
      wx.navigateTo({
        url:
          `/pages/desensitize/mask/index?taskId=${encodeURIComponent(taskId)}` +
          `&assetId=${encodeURIComponent(assetId)}` +
          `&albumId=${encodeURIComponent(this.albumId)}`,
        events: {
          maskUpdated: () => {
            this.loadPublicFace({ silent: true })
          },
        },
      })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '无法打开打码', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  async onRunHostAutoMask() {
    if (this.data.working) return
    this.setData({ working: true })
    try {
      const taskId = await this.ensureMaskTask()
      wx.showLoading({ title: '脱敏中…', mask: true })
      await runAutoMask(taskId)
      wx.hideLoading()
      wx.showToast({ title: '脱敏完成', icon: 'success' })
      await this.loadPublicFace({ silent: true })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '脱敏失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  async onContinueAfterReview() {
    if (this.data.working) return
    this.setData({ working: true })
    try {
      const audit = await auditHostedPublicPrivacy(this.albumId)
      const blocks = audit.hardBlocks || []
      this.setData({
        privacyPassed: Boolean(audit.passed),
        privacyBlocks: blocks,
      })
      if (!audit.passed) {
        wx.showToast({
          title: (blocks[0] && blocks[0].message) || '还有需处理项',
          icon: 'none',
        })
        return
      }
      const res = await generateHostedGeoDraft(this.albumId)
      const draft = res.geoDraft || {}
      this.setData({
        wizardStep: 3,
        publicPublishStage: res.publicPublishStage || 'awaiting_geo_confirm',
        geoDraft: draft,
        geoSummary: draft.summary || '',
        geoHighlights: Array.isArray(draft.highlights) ? draft.highlights : [],
        geoFaq: Array.isArray(draft.faq) ? draft.faq : [],
      })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '继续失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  async onRegenerateCopy() {
    if (this.data.working) return
    this.setData({ working: true })
    try {
      const res = await generateHostedGeoDraft(this.albumId)
      const draft = res.geoDraft || {}
      this.setData({
        geoDraft: draft,
        geoSummary: draft.summary || '',
        geoHighlights: Array.isArray(draft.highlights) ? draft.highlights : [],
        geoFaq: Array.isArray(draft.faq) ? draft.faq : [],
      })
      wx.showToast({ title: '已重新生成', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '生成失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  onGeoSummaryInput(e) {
    this.setData({ geoSummary: e.detail.value })
  },

  async onConfirmPublic() {
    if (this.data.working) return
    const summary = String(this.data.geoSummary || '').trim()
    if (!summary) {
      wx.showToast({ title: '请填写店页说明', icon: 'none' })
      return
    }
    this.setData({ working: true })
    try {
      await confirmHostedPublicPublish(this.albumId, {
        summary,
        highlights: this.data.geoHighlights || [],
        faq: this.data.geoFaq || [],
      })
      wx.showToast({ title: '已上店页', icon: 'success' })
      const album = await fetchMerchantServiceAlbum(this.albumId)
      this.applyAlbum(album)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '公开失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },
})
