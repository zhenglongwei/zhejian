const { mockGetReviewByOrderId } = require('../../../mock/reviews')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    orderId: '',
    reviewId: '',
    rewardAmount: 0,
  },

  onLoad(options) {
    const orderId = (options && options.orderId) || ''
    const reviewId = (options && options.reviewId) || ''
    const rewardAmount = Number(options && options.rewardAmount) || 0

    if (!orderId || !reviewId) {
      this.setData({
        status: 'error',
        errorMessage: '评价结果无效或链接已过期，请从订单详情重新进入。',
      })
      return
    }

    this.setData({ orderId, reviewId, rewardAmount })
    this.verifyResult(orderId, reviewId, rewardAmount)
  },

  async verifyResult(orderId, reviewId, rewardAmount) {
    this.setData({ status: 'loading', errorMessage: '' })
    await new Promise((r) => setTimeout(r, 120))
    const review = mockGetReviewByOrderId(orderId)
    if (!review || review.reviewId !== reviewId) {
      this.setData({
        status: 'error',
        errorMessage: '未找到对应评价记录，请从订单详情重新进入。',
      })
      return
    }
    this.setData({
      rewardAmount: rewardAmount || 0,
      status: 'normal',
    })
  },

  onRetry() {
    const { orderId } = this.data
    if (orderId) {
      wx.redirectTo({
        url: `/pages/order/detail/index?id=${orderId}`,
        fail: () => wx.switchTab({ url: '/pages/order/index' }),
      })
      return
    }
    wx.switchTab({
      url: '/pages/order/index',
      fail: () => wx.navigateBack(),
    })
  },

  onOpenRules() {
    wx.navigateTo({ url: '/pages/review/rules/index' })
  },

  onBackOrder() {
    const { orderId } = this.data
    if (orderId) {
      wx.redirectTo({ url: `/pages/order/detail/index?id=${orderId}` })
      return
    }
    wx.switchTab({ url: '/pages/order/index' })
  },

  onGoOrders() {
    wx.switchTab({ url: '/pages/order/index' })
  },
})
