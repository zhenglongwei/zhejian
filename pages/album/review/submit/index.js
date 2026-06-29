const { submitAlbumReview } = require('../../../services/album-review')
const { persistLocalImages } = require('../../../utils/media-upload')
const { checkAuth } = require('../../../utils/auth')
const { emptyReviewScores } = require('../../../constants/review-dimensions')
const {
  REVIEW_TAGS_POSITIVE,
  REVIEW_TAGS_NEGATIVE,
} = require('../../../constants/review-tags')
const {
  toggleReviewTag,
  reconcileTagsForPool,
  buildTagItems,
} = require('../../../utils/review-tag-fill')
const { calcOverallScore } = require('../../../utils/review-score')
const {
  ALBUM_REVIEW_CONSENT_TEXT,
  ALBUM_REVIEW_PUBLIC_CONSENT_TEXT,
  validateAlbumReviewForm,
  buildAlbumReviewPayload,
} = require('../../../utils/album-review-form')

Page({
  data: {
    status: 'ready',
    albumId: '',
    albumTitle: '',
    scores: emptyReviewScores(),
    overallScore: 0,
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
    submitting: false,
    loginSheetVisible: false,
  },

  onLoad(options) {
    const albumId = String(options.albumId || '').trim()
    const albumTitle = decodeURIComponent(options.albumTitle || '')
    if (!albumId) {
      wx.showToast({ title: '缺少相册信息', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    this.setData({
      albumId,
      albumTitle: albumTitle || '我的服务相册',
      tagItems: buildTagItems(REVIEW_TAGS_POSITIVE, []),
    })
    if (!checkAuth().ok) {
      this.setData({ loginSheetVisible: true })
    }
  },

  onScoresChange(e) {
    const scores = (e.detail && e.detail.values) || emptyReviewScores()
    this.setData({
      scores,
      overallScore: calcOverallScore(scores),
    })
    this.syncTagPool(scores)
  },

  syncTagPool(scores) {
    const avg =
      ['scoreService', 'scoreProfessional', 'scoreProcess']
        .map((k) => scores[k] || 0)
        .filter((v) => v > 0)
    const low = avg.length && avg.reduce((a, b) => a + b, 0) / avg.length <= 3
    const pool = low ? REVIEW_TAGS_NEGATIVE : REVIEW_TAGS_POSITIVE
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
      maxLength: 500,
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

  async onSubmit() {
    if (this.data.submitting) return
    if (!this.ensureAuth()) return

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
      wx.redirectTo({
        url: `/pages/album/review/result/index?reviewId=${review.id}&success=1`,
      })
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
