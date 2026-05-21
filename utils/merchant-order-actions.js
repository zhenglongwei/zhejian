const {
  acceptOrder,
  rejectOrder,
  rescheduleOrder,
  markOrderArrived,
  startOrderRepair,
} = require('../services/merchant-order')
const { ORDER_REJECT_REASONS } = require('../constants/order-reject-reasons')
const { buildBookingDates } = require('../constants/booking-slots')

function navigateToMerchantOrderDetail(orderId) {
  wx.navigateTo({
    url: `/packageMerchant/pages/order/detail/index?id=${orderId}`,
  })
}

function navigateToMerchantOrderAlbum(orderId) {
  wx.navigateTo({
    url: `/packageMerchant/pages/order/album/index?orderId=${orderId}`,
  })
}

function navigateToMerchantOrderComplete(orderId) {
  wx.navigateTo({
    url: `/packageMerchant/pages/order/complete/index?orderId=${orderId}`,
  })
}

function callUser(phone) {
  if (!phone) {
    wx.showToast({ title: '暂无用户联系电话', icon: 'none' })
    return
  }
  wx.makePhoneCall({ phoneNumber: String(phone) })
}

function showDeferred(feature) {
  wx.showToast({
    title: `${feature}将在后续版本开放`,
    icon: 'none',
  })
}

async function runWithLoading(task, successTitle) {
  try {
    wx.showLoading({ title: '处理中', mask: true })
    const result = await task()
    wx.hideLoading()
    if (successTitle) {
      wx.showToast({ title: successTitle, icon: 'success' })
    }
    return result
  } catch (e) {
    wx.hideLoading()
    wx.showToast({
      title: (e && e.message) || '操作失败',
      icon: 'none',
    })
    throw e
  }
}

function confirmAccept(orderId, onSuccess) {
  wx.showModal({
    title: '确认接单',
    content: '接单后将通知用户，并开始准备履约。确定接单吗？',
    confirmText: '确认接单',
    success: async (res) => {
      if (!res.confirm) return
      try {
        const detail = await runWithLoading(() => acceptOrder(orderId), '已接单')
        if (typeof onSuccess === 'function') onSuccess(detail)
      } catch (e) {
        /* toast handled */
      }
    },
  })
}

function showRejectSheet(ctx) {
  const { orderId, onSuccess } = ctx
  const itemList = ORDER_REJECT_REASONS.map((r) => r.label)
  wx.showActionSheet({
    itemList,
    success: async (res) => {
      const reason = ORDER_REJECT_REASONS[res.tapIndex]
      if (!reason) return
      let remark = ''
      if (reason.key === 'other') {
        wx.showModal({
          title: '拒单说明',
          editable: true,
          placeholderText: '请填写拒单原因（必填）',
          success: async (modalRes) => {
            if (!modalRes.confirm) return
            remark = (modalRes.content || '').trim()
            if (!remark) {
              wx.showToast({ title: '请填写拒单原因', icon: 'none' })
              return
            }
            await submitReject(orderId, reason, remark, onSuccess)
          },
        })
        return
      }
      wx.showModal({
        title: '确认拒单',
        content: `拒单原因：${reason.label}。拒单后用户将收到通知，在线支付订单将发起退款。`,
        confirmText: '确认拒单',
        success: async (modalRes) => {
          if (!modalRes.confirm) return
          await submitReject(orderId, reason, remark, onSuccess)
        },
      })
    },
  })
}

async function submitReject(orderId, reason, remark, onSuccess) {
  try {
    const detail = await runWithLoading(
      () =>
        rejectOrder(orderId, {
          reasonKey: reason.key,
          reasonLabel: reason.label,
          remark,
        }),
      '已拒单'
    )
    if (typeof onSuccess === 'function') onSuccess(detail)
  } catch (e) {
    /* toast handled */
  }
}

function showRescheduleForm(ctx) {
  const { order, onSuccess } = ctx
  const dates = buildBookingDates(7)
  const dateLabels = dates.map((d) => d.label)
  wx.showActionSheet({
    itemList: dateLabels.slice(0, 6),
    alertText: '选择新的预约日期',
    success: (dateRes) => {
      const pickedDate = dates[dateRes.tapIndex]
      if (!pickedDate) return
      wx.showActionSheet({
        itemList: pickedDate.slots,
        alertText: '选择时段',
        success: async (slotRes) => {
          const slot = pickedDate.slots[slotRes.tapIndex]
          if (!slot) return
          try {
            const detail = await runWithLoading(
              () =>
                rescheduleOrder(order.id, {
                  dateLabel: pickedDate.label,
                  date: pickedDate.value,
                  slot,
                  reason: '门店建议改期',
                }),
              '预约已更新'
            )
            if (typeof onSuccess === 'function') onSuccess(detail)
          } catch (e) {
            /* toast handled */
          }
        },
      })
    },
  })
}

function confirmArrive(orderId, onSuccess) {
  wx.showModal({
    title: '标记到店',
    content: '确认用户已到店？标记后用户端将同步显示。',
    confirmText: '确认到店',
    success: async (res) => {
      if (!res.confirm) return
      try {
        const detail = await runWithLoading(() => markOrderArrived(orderId), '已标记到店')
        if (typeof onSuccess === 'function') onSuccess(detail)
      } catch (e) {
        /* toast handled */
      }
    },
  })
}

function confirmStartRepair(orderId, onSuccess) {
  wx.showModal({
    title: '开始维修',
    content: '开始后将进入维修中状态，建议随后上传维修过程图片。',
    confirmText: '开始维修',
    success: async (res) => {
      if (!res.confirm) return
      try {
        const detail = await runWithLoading(() => startOrderRepair(orderId), '已开始维修')
        if (typeof onSuccess === 'function') onSuccess(detail)
      } catch (e) {
        /* toast handled */
      }
    },
  })
}

function handleMerchantOrderAction(actionKey, ctx) {
  const { order, detail, onRefresh } = ctx
  const id = order.id || (detail && detail.id)
  const contactPhone =
    (detail && detail.contact && detail.contact.phone) ||
    (order && order.contact && order.contact.phone)

  switch (actionKey) {
    case 'detail':
      navigateToMerchantOrderDetail(id)
      break
    case 'accept':
      confirmAccept(id, onRefresh)
      break
    case 'reject':
      showRejectSheet({ orderId: id, onSuccess: onRefresh })
      break
    case 'arrive':
      confirmArrive(id, onRefresh)
      break
    case 'startRepair':
      confirmStartRepair(id, onRefresh)
      break
    case 'reschedule':
      showRescheduleForm({ order: order || detail, onSuccess: onRefresh })
      break
    case 'album':
      navigateToMerchantOrderAlbum(id)
      break
    case 'complete':
      navigateToMerchantOrderComplete(id)
      break
    case 'callUser':
      callUser(contactPhone)
      break
    case 'review':
      showDeferred('评价查看')
      break
    case 'createCase':
      showDeferred('案例创建')
      break
    case 'support':
      showDeferred('平台客服')
      break
    default:
      navigateToMerchantOrderDetail(id)
  }
}

module.exports = {
  navigateToMerchantOrderDetail,
  navigateToMerchantOrderAlbum,
  navigateToMerchantOrderComplete,
  handleMerchantOrderAction,
}
