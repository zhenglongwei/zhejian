const { fetchOrderById } = require('../../services/order')
const { ORDER_TYPE } = require('../../constants/order-type')

Page({
  data: {
    status: 'loading',
    success: false,
    paid: false,
    order: null,
    orderSummaryRows: [],
    title: '',
    description: '',
    errorMessage: '',
  },

  onLoad(options) {
    this.orderId = options.orderId || ''
    this.successFlag = options.success === '1'
    this.paidFlag = options.paid === '1'
    if (!this.orderId || !this.successFlag) {
      this.setData({
        status: 'normal',
        success: false,
        title: '提交未完成',
        description: '你可以返回重新提交，或稍后在订单中查看状态。',
        errorMessage: options.message || '',
      })
      return
    }
    this.loadResult()
  },

  async loadResult() {
    this.setData({ status: 'loading' })
    try {
      const order = await fetchOrderById(this.orderId)
      const { title, description } = this.buildCopy(order)
      this.setData({
        status: 'normal',
        success: true,
        paid: this.paidFlag,
        order,
        orderSummaryRows: this.buildSummaryRows(order),
        title,
        description,
      })
    } catch (e) {
      this.setData({
        status: 'normal',
        success: true,
        paid: this.paidFlag,
        title: '提交成功',
        description: '订单已创建，可在订单 Tab 查看进度。',
      })
    }
  },

  buildSummaryRows(order) {
    if (!order) return []
    const appt = order.appointment || {}
    const timeText = appt.dateLabel && appt.slot
      ? `${appt.dateLabel} ${appt.slot}`
      : appt.slot || '—'
    return [
      { label: '订单编号', value: order.id },
      { label: '服务名称', value: order.serviceName },
      { label: '门店', value: order.storeName },
      { label: '预约时间', value: timeText },
    ]
  },

  buildCopy(order) {
    if (!order) {
      return { title: '提交成功', description: '可在订单 Tab 查看进度。' }
    }
    if (order.orderType === ORDER_TYPE.STANDARD_ORDER) {
      return {
        title: '支付成功',
        description:
          '订单已提交，等待商家接单。你可以在订单中查看维修进度与相册。',
      }
    }
    if (order.orderType === ORDER_TYPE.ACCIDENT_BOOKING) {
      return {
        title: '预约已提交',
        description:
          '事故车维修方案和费用需到店检测或拆检后确认。门店确认后会通知你。',
      }
    }
    return {
      title: '预约已提交',
      description: '门店确认后会通知你。实际方案和费用以到店检测结果为准。',
    }
  },

  onViewOrder() {
    const { order } = this.data
    if (order && order.id) {
      wx.navigateTo({ url: `/pages/order/detail/index?id=${order.id}` })
      return
    }
    wx.switchTab({ url: '/pages/order/index' })
  },

  onBackHome() {
    wx.switchTab({ url: '/pages/home/index' })
  },

  onRetry() {
    wx.navigateBack({ delta: 1 })
  },
})
