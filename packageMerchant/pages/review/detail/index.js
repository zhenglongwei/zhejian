const {
  getMerchantAlbumReviewById,
  replyMerchantAlbumReview,
} = require('../../../../services/merchant-album-review')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')
const { REVIEW_DIMENSIONS } = require('../../../../constants/review-dimensions')
const { ALL_REVIEW_DIMENSIONS } = require('../../../../constants/album-review-dimensions')

function buildScoreRows(scores = {}) {
  const dims = scores.repairAttitude != null ? ALL_REVIEW_DIMENSIONS : REVIEW_DIMENSIONS
  return dims.map((dim) => ({
    label: dim.label,
    hint: dim.hint || '',
    value: scores[dim.key] || 0,
  })).filter((row) => row.value > 0)
}

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    review: null,
    scoreRows: [],
    replyDraft: '',
    replyLength: 0,
    submitting: false,
    storeId: '',
  },

  onLoad(options) {
    this.reviewId = options.id || ''
    if (!this.reviewId) {
      this.setData({
        status: 'error',
        errorMessage: '评价不存在',
      })
      return
    }
    this.ensureMerchant()
  },

  async ensureMerchant() {
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
      this.setData({
        status: 'error',
        errorMessage: '请先完成商家入驻',
      })
      return
    }
    this.storeId = profile.storeId || ''
    this.setData({ storeId: this.storeId })
    this.loadDetail()
  },

  async loadDetail() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const review = await getMerchantAlbumReviewById(this.reviewId, this.storeId)
      if (!review) {
        this.setData({ status: 'error', errorMessage: '评价不存在' })
        return
      }
      this.setData({
        status: 'normal',
        review,
        scoreRows: buildScoreRows(review.scores),
        replyDraft: review.merchantReply || '',
        replyLength: (review.merchantReply || '').length,
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onReplyInput(e) {
    const value = e.detail.value || ''
    this.setData({ replyDraft: value, replyLength: value.length })
  },

  async onSubmitReply() {
    if (this.data.submitting) return
    const reply = String(this.data.replyDraft || '').trim()
    if (!reply) {
      wx.showToast({ title: '请填写回复', icon: 'none' })
      return
    }
    if (reply.length > 500) {
      wx.showToast({ title: '回复不超过 500 字', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      const review = await replyMerchantAlbumReview(this.reviewId, this.storeId, reply)
      this.setData({ review, replyDraft: review.merchantReply || reply })
      wx.showToast({ title: '回复已提交', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  onRetry() {
    this.loadDetail()
  },
})
