const { fetchOrderById } = require('../../../services/order')
const { fetchReviewByOrderId } = require('../../../services/review')
const { getDetailBottomActions } = require('../../../utils/order-display')
const { REVIEW_STATUS } = require('../../../constants/review-status')
const {
  handleOrderAction,
  navigateToOrderAlbum,
} = require('../../../utils/order-actions')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    detail: null,
    bottomPrimary: null,
    bottomSecondary: null,
    showBottomBar: false,
    reviewSummary: null,
  },

  onLoad(options) {
    this.orderId = options.id || ''
    if (!this.orderId) {
      this.setData({
        status: 'error',
        errorMessage: '订单不存在或已被删除。',
      })
      return
    }
    this.loadDetail()
  },

  async loadDetail() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const detail = await fetchOrderById(this.orderId)
      const bottom = getDetailBottomActions(detail)
      let reviewSummary = null
      if (
        detail.reviewStatus &&
        detail.reviewStatus !== REVIEW_STATUS.NOT_REVIEWED
      ) {
        reviewSummary = await fetchReviewByOrderId(this.orderId)
      }
      this.setData({
        detail,
        reviewSummary,
        bottomPrimary: bottom.primary,
        bottomSecondary: bottom.secondary,
        showBottomBar: Boolean(bottom.primary),
        status: 'normal',
      })
    } catch (e) {
      const code = e && e.code
      let message = (e && e.message) || '加载失败'
      if (code === 403) message = '你无权查看该订单。'
      if (code === 404) message = '订单不存在或已被删除。'
      this.setData({
        status: 'error',
        errorMessage: message,
        detail: null,
        showBottomBar: false,
      })
    }
  },

  onRetry() {
    this.loadDetail()
  },

  refreshDetail(detail) {
    const bottom = getDetailBottomActions(detail)
    const loadReview =
      detail.reviewStatus &&
      detail.reviewStatus !== REVIEW_STATUS.NOT_REVIEWED
    const apply = (reviewSummary) => {
      this.setData({
        detail,
        reviewSummary: reviewSummary || this.data.reviewSummary,
        bottomPrimary: bottom.primary,
        bottomSecondary: bottom.secondary,
        showBottomBar: Boolean(bottom.primary),
        status: 'normal',
      })
    }
    if (loadReview) {
      fetchReviewByOrderId(this.orderId)
        .then((review) => apply(review))
        .catch(() => apply(null))
      return
    }
    apply(null)
  },

  onBottomPrimary() {
    this.runAction(this.data.bottomPrimary)
  },

  onBottomSecondary() {
    this.runAction(this.data.bottomSecondary)
  },

  runAction(action) {
    if (!action || !this.data.detail) return
    handleOrderAction(action.actionKey, {
      order: this.data.detail,
      detail: this.data.detail,
      onRefresh: (d) => this.refreshDetail(d || this.data.detail),
    })
  },

  onTimelineLink() {
    navigateToOrderAlbum(this.orderId)
  },

  onAlbumEntry() {
    navigateToOrderAlbum(this.orderId)
  },

  onStoreDetail() {
    const { detail } = this.data
    if (!detail || !detail.store || !detail.store.id) return
    wx.navigateTo({
      url: `/pages/store/detail/index?id=${detail.store.id}`,
    })
  },

  onCallStore() {
    handleOrderAction('call', {
      order: this.data.detail,
      detail: this.data.detail,
    })
  },

  onNavStore() {
    handleOrderAction('nav', {
      order: this.data.detail,
      detail: this.data.detail,
    })
  },

  onAfterSaleHint() {
    handleOrderAction('aftersale', {
      order: this.data.detail,
      detail: this.data.detail,
    })
  },

  onSupport() {
    handleOrderAction('support', {
      order: this.data.detail,
      detail: this.data.detail,
    })
  },
})
