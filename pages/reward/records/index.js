const { fetchRewardRecords } = require('../../../services/reward')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    records: [],
    total: 0,
  },

  onShow() {
    this.loadPage()
  },

  onPullDownRefresh() {
    this.loadPage().finally(() => wx.stopPullDownRefresh())
  },

  async loadPage() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const { list, total } = await fetchRewardRecords()
      this.setData({
        records: list,
        total,
        status: list.length ? 'normal' : 'empty',
      })
    } catch (e) {
      const code = e && e.code
      let message = (e && e.message) || '加载失败，请重试'
      if (code === 401) message = '请先登录后查看奖励记录'
      this.setData({
        status: 'error',
        errorMessage: message,
        records: [],
      })
    }
  },

  onRetry() {
    this.loadPage()
  },

  onOpenRules() {
    wx.navigateTo({ url: '/pages/review/rules/index' })
  },

  onRecordTap(e) {
    const orderId = (e.detail && e.detail.orderId) || ''
    if (!orderId) return
    wx.navigateTo({
      url: `/pages/order/detail/index?id=${orderId}`,
    })
  },
})
