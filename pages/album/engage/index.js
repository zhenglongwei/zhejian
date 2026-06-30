const { fetchAlbumReviewContext, submitAlbumReview } = require('../../../services/album-review')
const { fetchAlbumPartVerifyContext } = require('../../../services/album-part-verify')
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
  ALBUM_REVIEW_CONSENT_TEXT,
  ALBUM_REVIEW_PUBLIC_CONSENT_TEXT,
  validateAlbumReviewForm,
  buildAlbumReviewPayload,
  resolveReviewTagPool,
} = require('../../../utils/album-review-form')
const {
  resolveReviewStepLabel,
  resolveReviewStepVariant,
  resolveAuthorizeStepLabel,
  resolveAuthorizeStepVariant,
  buildFlowGuideText,
  buildPublicConsentHint,
  buildReviewSyncedHint,
  buildReviewImageMaskHint,
  canStartAuthorizePublic,
} = require('../../../utils/album-public-case-flow')

function buildFlowView(reviewCtx, hasReview) {
  const publicCaseStatus = reviewCtx.publicCaseStatus || 'private'
  const reviewAuthorizePublic = Boolean(reviewCtx.reviewAuthorizePublic)
  const imagesMaskStatus = reviewCtx.imagesMaskStatus || 'none'
  return {
    publicCaseStatus,
    canAuthorizePublic: Boolean(reviewCtx.canAuthorizePublic),
    reviewAuthorizePublic,
    imagesMaskStatus,
    publicImagesReady: Boolean(reviewCtx.publicImagesReady),
    imageMaskHint: buildReviewImageMaskHint(imagesMaskStatus),
    flowGuideText: buildFlowGuideText(),
    reviewStepLabel: resolveReviewStepLabel(hasReview),
    reviewStepVariant: resolveReviewStepVariant(hasReview),
    authorizeStepLabel: resolveAuthorizeStepLabel(publicCaseStatus),
    authorizeStepVariant: resolveAuthorizeStepVariant(publicCaseStatus),
    publicConsentHint: buildPublicConsentHint(publicCaseStatus),
    reviewSyncedHint: buildReviewSyncedHint(
      publicCaseStatus,
      reviewAuthorizePublic,
      imagesMaskStatus,
    ),
    showAuthorizeCta: canStartAuthorizePublic(publicCaseStatus, reviewCtx.eligible),
  }
}

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
      consent: false,
      authorizePublic: false,
    },
    consentText: ALBUM_REVIEW_CONSENT_TEXT,
    publicConsentText: ALBUM_REVIEW_PUBLIC_CONSENT_TEXT,
    publicConsentHint: '',
    reviewSyncedHint: '',
    flowGuideText: '',
    reviewStepLabel: '待填写',
    reviewStepVariant: 'info',
    authorizeStepLabel: '未授权',
    authorizeStepVariant: 'info',
    publicCaseStatus: 'private',
    canAuthorizePublic: false,
    reviewAuthorizePublic: false,
    showAuthorizeCta: false,
    imagesMaskStatus: 'none',
    publicImagesReady: false,
    imageMaskHint: '',
    submitting: false,
    loginSheetVisible: false,
  },

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
      const [reviewCtx, partCtx] = await Promise.all([
        fetchAlbumReviewContext(this.data.albumId),
        fetchAlbumPartVerifyContext(this.data.albumId).catch(() => null),
      ])
      const review = reviewCtx.review || null
      const hasReview = Boolean(review && review.id)
      this.setData({
        status: 'normal',
        albumTitle: reviewCtx.albumTitle || fallbackTitle || '我的服务相册',
        eligible: Boolean(reviewCtx.eligible),
        ineligibleReason: reviewCtx.ineligibleReason || '',
        hasReview,
        existingRepairScore: review ? Number(review.repairScore) || 0 : 0,
        existingAlbumScore: review ? Number(review.albumScore) || 0 : 0,
        hasParts: Boolean(partCtx && partCtx.hasParts),
        partVerifySummary: (partCtx && partCtx.summary && partCtx.summary.label) || '',
        consentText: reviewCtx.consentText || ALBUM_REVIEW_CONSENT_TEXT,
        publicConsentText: reviewCtx.publicConsentText || ALBUM_REVIEW_PUBLIC_CONSENT_TEXT,
        ...buildFlowView(reviewCtx, hasReview),
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

  onGoAuthorize() {
    wx.navigateBack({ delta: 1 })
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

  toggleConsent() {
    this.setData({ 'form.consent': !this.data.form.consent })
  },

  toggleAuthorizePublic() {
    this.setData({ 'form.authorizePublic': !this.data.form.authorizePublic })
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
      consent: this.data.form.consent,
      authorizePublic: this.data.form.authorizePublic,
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
      const reviewAuthorizePublic = Boolean(payload.authorizePublic)
      const imagesMaskStatus =
        (review && review.imagesMaskStatus) ||
        (reviewAuthorizePublic && form.images && form.images.length ? 'pending' : 'none')
      const flowPatch = buildFlowView(
        {
          publicCaseStatus: this.data.publicCaseStatus,
          eligible: this.data.eligible,
          canAuthorizePublic: this.data.canAuthorizePublic,
          reviewAuthorizePublic,
          imagesMaskStatus,
          publicImagesReady: Boolean(review && review.publicImagesReady),
        },
        true,
      )
      this.setData({
        hasReview: true,
        existingRepairScore: Number(review.repairScore) || payload.repairScore || 0,
        existingAlbumScore: Number(review.albumScore) || payload.albumScore || 0,
        reviewAuthorizePublic,
        ...flowPatch,
      })
      const toastTitle =
        reviewAuthorizePublic && form.images && form.images.length
          ? flowPatch.publicImagesReady
            ? '评价已提交，配图已脱敏'
            : '评价已提交，配图脱敏处理中'
          : '评价已提交'
      wx.showToast({ title: toastTitle, icon: 'success' })
    } catch (e) {
      wx.showToast({
        title: (e && e.message) || '提交失败，请稍后重试',
        icon: 'none',
      })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
