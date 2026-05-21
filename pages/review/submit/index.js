const { fetchReviewInfo, submitReview } = require('../../../services/review')
const { emptyReviewScores } = require('../../../constants/review-dimensions')
const {
  REVIEW_TAGS_POSITIVE,
  REVIEW_TAGS_NEGATIVE,
} = require('../../../constants/review-tags')
const { calcOverallScore } = require('../../../utils/review-score')
const {
  toggleReviewTag,
  reconcileTagsForPool,
  buildTagItems,
} = require('../../../utils/review-tag-fill')
const { checkAuth } = require('../../../utils/auth')

const CONTENT_GUIDE_SUGGEST_LEN = 20
const LOW_SCORE_THRESHOLD = 3

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    info: null,
    summaryRows: [],
    scores: emptyReviewScores(),
    content: '',
    selectedTags: [],
    tagInsertions: {},
    tagItems: [],
    tagOptions: [],
    images: [],
    anonymous: false,
    liabilityAccepted: false,
    submitting: false,
    contentCount: 0,
    contentGuide: '',
    loginSheetVisible: false,
    loginSheetMode: 'auto',
  },

  onLoad(options) {
    this.orderId = options.orderId || options.id || ''
    if (!this.orderId) {
      this.setData({ status: 'error', errorMessage: '订单不存在或已被删除。' })
      return
    }
    this.tryLoad()
  },

  tryLoad() {
    const auth = checkAuth({ needPhone: true })
    if (!auth.ok) {
      this.setData({
        loginSheetVisible: true,
        loginSheetMode: auth.reason === 'bindPhone' ? 'bindPhone' : 'auto',
        status: 'loading',
      })
      return
    }
    this.loadInfo()
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
    if (this.data.status === 'loading' && !this.data.info) {
      wx.navigateBack({
        fail: () => wx.switchTab({ url: '/pages/order/index' }),
      })
    }
  },

  onLoginSheetSuccess() {
    this.setData({ loginSheetVisible: false })
    this.loadInfo()
  },

  resolveTagPool(scores) {
    const overall = calcOverallScore(scores)
    if (overall > 0 && overall <= LOW_SCORE_THRESHOLD) {
      return REVIEW_TAGS_NEGATIVE
    }
    return REVIEW_TAGS_POSITIVE
  },

  syncTagState(patch) {
    const tagOptions = patch.tagOptions != null ? patch.tagOptions : this.data.tagOptions
    const selectedTags = patch.selectedTags != null ? patch.selectedTags : this.data.selectedTags
    return {
      ...patch,
      tagItems: buildTagItems(tagOptions, selectedTags),
    }
  },

  async loadInfo() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const info = await fetchReviewInfo(this.orderId)
      const summaryRows = [
        { label: '服务项目', value: info.serviceName },
        { label: '门店', value: info.storeName },
        { label: '服务时间', value: (info.completedAt || '').slice(0, 10) || '—' },
        { label: '车辆', value: info.vehicleSummary },
      ]
      if (info.orderNoTail) {
        summaryRows.push({ label: '订单编号', value: `…${info.orderNoTail}` })
      }
      const tagOptions = REVIEW_TAGS_POSITIVE
      this.setData(
        this.syncTagState({
          info,
          summaryRows,
          tagOptions,
          selectedTags: [],
          tagInsertions: {},
          contentGuide: this.buildContentGuide(''),
          status: 'normal',
        })
      )
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onRetry() {
    this.loadInfo()
  },

  onScoresChange(e) {
    const scores = (e.detail && e.detail.values) || {}
    const nextPool = this.resolveTagPool(scores)
    const reconciled = reconcileTagsForPool({
      content: this.data.content,
      selectedTags: this.data.selectedTags,
      tagInsertions: this.data.tagInsertions,
      nextPool,
    })
    const content = reconciled.content
    this.setData(
      this.syncTagState({
        scores,
        tagOptions: nextPool,
        content,
        selectedTags: reconciled.selectedTags,
        tagInsertions: reconciled.tagInsertions,
        contentCount: content.length,
        contentGuide: this.buildContentGuide(content),
      })
    )
  },

  buildContentGuide(content) {
    const len = (content || '').trim().length
    if (len >= CONTENT_GUIDE_SUGGEST_LEN) {
      return '内容较完整，感谢分享真实体验。'
    }
    if (len > 0) {
      return `还可再写约 ${CONTENT_GUIDE_SUGGEST_LEN - len} 字，让其他车主更易理解（选填，不影响提交与奖励）。`
    }
    return '文字评价选填。点击上方标签可快速填入，也可自行输入。'
  },

  onContentInput(e) {
    const content = e.detail.value || ''
    this.setData({
      content,
      contentCount: content.length,
      contentGuide: this.buildContentGuide(content),
    })
  },

  onTagChipTap(e) {
    const tag = e.detail && e.detail.text
    if (!tag) return
    const maxLength = (this.data.info && this.data.info.maxContentLength) || 300
    const result = toggleReviewTag({
      tag,
      content: this.data.content,
      selectedTags: this.data.selectedTags,
      tagInsertions: this.data.tagInsertions,
      maxLength,
    })
    if (result.overflow) {
      wx.showToast({ title: '文字已达上限', icon: 'none' })
      return
    }
    const content = result.content
    this.setData(
      this.syncTagState({
        content,
        selectedTags: result.selectedTags,
        tagInsertions: result.tagInsertions,
        contentCount: content.length,
        contentGuide: this.buildContentGuide(content),
      })
    )
  },

  onImagesChange(e) {
    this.setData({ images: (e.detail && e.detail.images) || [] })
  },

  onAnonymousToggle() {
    this.setData({ anonymous: !this.data.anonymous })
  },

  onLiabilityToggle() {
    this.setData({ liabilityAccepted: !this.data.liabilityAccepted })
  },

  onOpenRules() {
    wx.navigateTo({ url: '/pages/review/rules/index' })
  },

  async onSubmit() {
    if (this.data.submitting) return
    const { scores, content, liabilityAccepted, selectedTags } = this.data
    const missing = Object.keys(scores).some((k) => !scores[k] || scores[k] < 1)
    if (missing) {
      wx.showToast({ title: '请完成全部六维评分', icon: 'none' })
      return
    }
    if (!liabilityAccepted) {
      wx.showToast({ title: '请确认真实评价承诺', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      wx.showLoading({ title: '提交中', mask: true })
      const result = await submitReview(this.orderId, {
        scores,
        content: (content || '').trim(),
        tags: selectedTags,
        images: this.data.images,
        anonymous: this.data.anonymous,
        liabilityAccepted: true,
      })
      wx.hideLoading()
      const reward = result.reward || {}
      wx.redirectTo({
        url: `/pages/review/result/index?orderId=${this.orderId}&reviewId=${result.review.reviewId}&rewardAmount=${reward.amount || 0}`,
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
