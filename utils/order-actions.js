const { ORDER_STATUS } = require('../constants/order-status')
const { cancelUserOrder, confirmOrderFinish } = require('../services/order')

function navigateToOrderDetail(orderId) {
  wx.navigateTo({ url: `/pages/order/detail/index?id=${orderId}` })
}

function openStoreNav(store) {
  if (!store) {
    wx.showToast({ title: '暂无门店位置信息', icon: 'none' })
    return
  }
  if (store.latitude != null && store.longitude != null) {
    wx.openLocation({
      latitude: Number(store.latitude),
      longitude: Number(store.longitude),
      name: store.name || '门店',
      address: store.address || '',
    })
    return
  }
  wx.showToast({ title: '门店导航将在后续版本开放', icon: 'none' })
}

function callStore(phone) {
  if (!phone) {
    wx.showToast({ title: '门店暂未提供联系电话', icon: 'none' })
    return
  }
  wx.makePhoneCall({ phoneNumber: String(phone) })
}

function navigateToOrderAlbum(orderId) {
  if (!orderId) {
    wx.showToast({ title: '订单信息缺失', icon: 'none' })
    return
  }
  wx.navigateTo({
    url: `/pages/order/album/index?orderId=${orderId}`,
  })
}

function navigateToReview(orderId) {
  if (!orderId) {
    wx.showToast({ title: '订单信息缺失', icon: 'none' })
    return
  }
  wx.navigateTo({
    url: `/pages/review/submit/index?orderId=${orderId}`,
  })
}

function showDeferred(feature) {
  wx.showToast({
    title: `${feature}将在后续版本开放`,
    icon: 'none',
  })
}

function confirmFinishWithModal(orderId, onSuccess) {
  wx.showModal({
    title: '确认完工',
    content:
      '确认后订单将完成。请确认车辆服务结果无误。如有问题，请先联系门店或申请售后。',
    confirmText: '确认完工',
    cancelText: '暂不确认',
    success: async (res) => {
      if (!res.confirm) return
      try {
        wx.showLoading({ title: '提交中', mask: true })
        const detail = await confirmOrderFinish(orderId)
        wx.hideLoading()
        wx.showToast({ title: '已确认完工', icon: 'success' })
        if (typeof onSuccess === 'function') onSuccess(detail)
      } catch (e) {
        wx.hideLoading()
        wx.showToast({
          title: (e && e.message) || '操作失败',
          icon: 'none',
        })
      }
    },
  })
}

function cancelOrderWithModal(order, onSuccess) {
  wx.showModal({
    title: order.status === ORDER_STATUS.WAIT_PAY ? '取消订单' : '取消预约',
    content: '确定要取消吗？如已支付，将按规则处理退款。',
    confirmText: '确定取消',
    cancelText: '再想想',
    success: async (res) => {
      if (!res.confirm) return
      try {
        wx.showLoading({ title: '处理中', mask: true })
        const detail = await cancelUserOrder(order.id)
        wx.hideLoading()
        wx.showToast({ title: '已取消', icon: 'success' })
        if (typeof onSuccess === 'function') onSuccess(detail)
      } catch (e) {
        wx.hideLoading()
        wx.showToast({
          title: (e && e.message) || '取消失败',
          icon: 'none',
        })
      }
    },
  })
}

function handleOrderAction(actionKey, ctx) {
  const { order, detail, onRefresh } = ctx
  const id = order.id
  const store = (detail && detail.store) || {}

  switch (actionKey) {
    case 'detail':
      navigateToOrderDetail(id)
      break
    case 'pay':
      showDeferred('在线支付')
      break
    case 'album':
      navigateToOrderAlbum(id)
      break
    case 'nav':
      openStoreNav(store)
      break
    case 'call':
      callStore(store.phone)
      break
    case 'confirmFinish':
      confirmFinishWithModal(id, onRefresh)
      break
    case 'cancel':
      cancelOrderWithModal(order, onRefresh)
      break
    case 'review':
      navigateToReview(id)
      break
    case 'aftersale':
      showDeferred('售后申请')
      break
    case 'refund':
      showDeferred('退款进度')
      break
    case 'support':
      showDeferred('联系客服')
      break
    case 'archive':
      showDeferred('服务相册')
      break
    case 'reorder':
      if (order.serviceId) {
        wx.navigateTo({
          url: `/pages/service/detail/index?id=${order.serviceId}`,
        })
      } else {
        wx.navigateTo({ url: '/pages/service/index' })
      }
      break
    default:
      navigateToOrderDetail(id)
  }
}

module.exports = {
  navigateToOrderDetail,
  navigateToOrderAlbum,
  navigateToReview,
  handleOrderAction,
}
