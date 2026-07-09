const { fetchAlbumReviewContext, submitAlbumReview, prepareReviewImagePreview } = require('../../../services/album-review')
const { fetchAlbumPartVerifyContext } = require('../../../services/album-part-verify')
const { fetchServiceAlbum } = require('../../../services/service-album')
const { persistLocalImages } = require('../../../utils/media-upload')
const { checkAuth } = require('../../../utils/auth')
const {
  ALBUM_REVIEW_GROUPS,
  emptyAlbumReviewScores,
} = require('../../../constants/album-review-dimensions')
const {
  toggleReviewTag,
  reconcileTagsForPool,
  buildTagItems,
} = require('../../../utils/review-tag-fill')
const {
  calcRepairScore,
  calcAlbumScore,
} = require('../../../utils/album-review-score')
const {
  validateAlbumReviewForm,
  buildAlbumReviewPayload,
  resolveReviewTagPool,
} = require('../../../utils/album-review-form')
const {
  albumAuthShareData,
  buildAlbumActionState,
  createAlbumAuthShareHandlers,
} = require('../../../utils/album-auth-share-handlers')
const {
  buildAlbumGateBanner,
  buildGateActionButtons,
  runGateUserAction,
} = require('../../../utils/album-gate-actions')

const authShareHandlers = createAlbumAuthShareHandlers({
  onAuthChanged() {
    return this.loadContext(this.data.albumTitle)
  },
})

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    albumTitle: '',
    eligible: false,
    ineligibleReason: '',
    hasReview: false,
    existingRepairScore: 0,
    existingAlbumScore: 0,
    hasParts: false,
    partVerifySummary: '',
    reviewGroups: ALBUM_REVIEW_GROUPS,
    scores: emptyAlbumReviewScores(),
    repairScore: 0,
    albumScore: 0,
    content: '',
    contentLength: 0,
    selectedTags: [],
    tagInsertions: {},
    tagItems: [],
    form: {
      images: [],
    },
    submitting: false,
    loginSheetVisible: false,
    needsReviewImagePreview: false,
    gateBanner: '',
    gateActions: [],
    ...albumAuthShareData(),
  },

  ...authShareHandlers,

  onLoad(options) {
    const albumId = String(options.albumId || '').trim()
    const albumTitle = decodeURIComponent(options.albumTitle || '')
    if (!albumId) {
      this.setData({
        status: 'error',
        errorMessage: '缺少相册信息，请从服务相册详情进入',
      })
      return
    }
    this.actionAlbumId = albumId
    this.setData({
      albumId,
      albumTitle,
      tagItems: buildTagItems(resolveReviewTagPool({}), []),
    })
    if (!checkAuth().ok) {
      this.setData({ loginSheetVisible: true })
    }
    this.loadContext(albumTitle)
  },

  async loadContext(fallbackTitle = '') {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const [reviewCtx, partCtx, albumDetail] = await Promise.all([
        fetchAlbumReviewContext(this.data.albumId),
        fetchAlbumPartVerifyContext(this.data.albumId).catch(() => null),
        fetchServiceAlbum(this.data.albumId).catch(() => null),
      ])
      const review = reviewCtx.review || null
      const hasReview = Boolean(review && review.id)
      const actionState = albumDetail ? buildAlbumActionState(albumDetail) : {}
      const gateBanner = albumDetail ? buildAlbumGateBanner(albumDetail) : ''
      const gateActions = albumDetail ? buildGateActionButtons(albumDetail) : []
      const albumTitle = reviewCtx.albumTitle || fallbackTitle || '我的服务相册'
      wx.setNavigationBarTitle({
        title: hasReview ? '评价已提交' : '评价与反馈',
      })
      this.setData({
        status: 'normal',
        albumTitle,
        eligible: Boolean(reviewCtx.eligible),
        ineligibleReason: reviewCtx.ineligibleReason || '',
        hasReview,
        existingRepairScore: review ? Number(review.repairScore) || 0 : 0,
        existingAlbumScore: review ? Number(review.albumScore) || 0 : 0,
        hasParts: Boolean(partCtx && partCtx.hasParts),
        partVerifySummary: (partCtx && partCtx.summary && partCtx.summary.label) || '',
        needsReviewImagePreview: Boolean(reviewCtx.needsReviewImagePreview),
        gateBanner,
        gateActions,
        actionDetail: albumDetail,
        ...actionState,
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onRetry() {
    this.loadContext(this.data.albumTitle)
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  },

  ensureAuth() {
    const auth = checkAuth()
    if (!auth.ok) {
      this.setData({ loginSheetVisible: true })
      return false
    }
    return true
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
  },

  onLoginSuccess() {
    this.closeLoginSheet()
    this.loadContext(this.data.albumTitle)
  },

  buildBaseQuery() {
    const { albumId, albumTitle } = this.data
    return (
      `albumId=${encodeURIComponent(albumId)}` +
      `&albumTitle=${encodeURIComponent(albumTitle)}`
    )
  },

  onOpenFeedback() {
    if (!this.ensureAuth()) return
    wx.navigateTo({
      url: `/pages/album/feedback/index?${this.buildBaseQuery()}`,
    })
  },

  onOpenPartVerify() {
    if (!this.ensureAuth()) return
    wx.navigateTo({
      url: `/pages/album/part-verify/index?${this.buildBaseQuery()}`,
    })
  },

  async onOpenReviewImagePreview() {
    if (!this.ensureAuth()) return
    try {
      wx.showLoading({ title: '加载中', mask: true })
      const preview = await prepareReviewImagePreview(this.data.albumId)
      wx.hideLoading()
      wx.navigateTo({
        url:
          `/pages/desensitize/preview/index?taskId=${encodeURIComponent(preview.taskId)}` +
          `&albumId=${encodeURIComponent(this.data.albumId)}` +
          `&albumTitle=${encodeURIComponent(this.data.albumTitle)}` +
          '&source=review&fromPreMask=1',
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '暂时无法打开预览', icon: 'none' })
    }
  },

  goReviewImagePreview(taskId) {
    if (!taskId) return
    wx.navigateTo({
      url:
        `/pages/desensitize/preview/index?taskId=${encodeURIComponent(taskId)}` +
        `&albumId=${encodeURIComponent(this.data.albumId)}` +
        `&albumTitle=${encodeURIComponent(this.data.albumTitle)}` +
        '&source=review&fromPreMask=1',
    })
  },

  onScoresChange(e) {
    const scores = { ...this.data.scores, ...((e.detail && e.detail.values) || {}) }
    this.setData({
      scores,
      repairScore: calcRepairScore(scores),
      albumScore: calcAlbumScore(scores),
    })
    this.syncTagPool(scores)
  },

  syncTagPool(scores) {
    const pool = resolveReviewTagPool(scores)
    const reconciled = reconcileTagsForPool({
      content: this.data.content,
      selectedTags: this.data.selectedTags,
      tagInsertions: this.data.tagInsertions,
      nextPool: pool,
    })
    this.setData({
      tagItems: buildTagItems(pool, reconciled.selectedTags),
      content: reconciled.content,
      contentLength: reconciled.content.length,
      selectedTags: reconciled.selectedTags,
      tagInsertions: reconciled.tagInsertions,
    })
  },

  onContentInput(e) {
    const value = e.detail.value || ''
    this.setData({ content: value, contentLength: value.length })
  },

  onTagTap(e) {
    const tag = (e.detail && e.detail.text) || ''
    if (!tag) return
    const result = toggleReviewTag({
      tag,
      content: this.data.content,
      selectedTags: this.data.selectedTags,
      tagInsertions: this.data.tagInsertions,
      maxLength: 300,
    })
    if (result.overflow) {
      wx.showToast({ title: '内容过长', icon: 'none' })
      return
    }
    const pool = this.data.tagItems.map((item) => item.text)
    this.setData({
      content: result.content,
      contentLength: (result.content || '').length,
      selectedTags: result.selectedTags,
      tagInsertions: result.tagInsertions,
      tagItems: buildTagItems(pool, result.selectedTags),
    })
  },

  onImagesChange(e) {
    this.setData({ 'form.images': e.detail.images || [] })
  },

  async onSubmit() {
    if (this.data.submitting || this.data.hasReview) return
    if (!this.ensureAuth()) return
    if (!this.data.eligible) {
      wx.showToast({
        title: this.data.ineligibleReason || '暂不可评价',
        icon: 'none',
      })
      return
    }

    const form = {
      scores: this.data.scores,
      content: this.data.content,
      selectedTags: this.data.selectedTags,
      images: this.data.form.images,
      consent: true,
    }
    const validation = validateAlbumReviewForm(form)
    if (!validation.ok) {
      wx.showToast({ title: validation.message, icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      let payload = buildAlbumReviewPayload(form)
      if (payload.images.length) {
        const { images, droppedStaleCount } = await persistLocalImages(payload.images)
        if (droppedStaleCount > 0) {
          wx.showToast({ title: '部分图片已失效，请重新选择', icon: 'none' })
        }
        payload = { ...payload, images }
      }
      const review = await submitAlbumReview(this.data.albumId, payload)
      const hasImages = Boolean(form.images && form.images.length)
      const imagesMaskStatus = (review && review.imagesMaskStatus) || (hasImages ? 'pending' : 'none')
      wx.setNavigationBarTitle({ title: '评价已提交' })
      const needsReviewImagePreview = Boolean(review && review.needsReviewImagePreview)
      const reviewPreviewTaskId = (review && review.reviewPreviewTaskId) || ''
      this.setData({
        hasReview: true,
        needsReviewImagePreview,
        existingRepairScore: Number(review.repairScore) || payload.repairScore || 0,
        existingAlbumScore: Number(review.albumScore) || payload.albumScore || 0,
      })
      await this.loadContext(this.data.albumTitle)
      const toastTitle =
        hasImages && imagesMaskStatus === 'ready'
          ? '评价已提交，配图已脱敏'
          : hasImages
            ? '评价已提交，配图脱敏处理中'
            : '评价已提交'
      wx.showToast({ title: toastTitle, icon: 'success' })
      if (needsReviewImagePreview && reviewPreviewTaskId) {
        setTimeout(() => {
          this.goReviewImagePreview(reviewPreviewTaskId)
        }, 600)
      }
    } catch (e) {
      wx.showToast({
        title: (e && e.message) || '提交失败，请稍后重试',
        icon: 'none',
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  onGateActionTap(e) {
    const key =
      (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) ||
      (e.detail && e.detail.key) ||
      ''
    if (!key) return
    runGateUserAction(this, key, this.data.actionDetail || {})
  },

  onShareAppMessage() {
    return this.buildShareAppMessagePayload()
  },
})
