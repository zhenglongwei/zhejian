const { ORDER_STATUS } = require('../constants/order-status')
const { ORDER_TYPE } = require('../constants/order-type')
const { PRICE_MODE } = require('../constants/price-mode')
const {
  REFUND_STATUS,
  formatOrderDateTime,
  getVehicleSummary,
  getAppointmentText,
  buildProgressSteps,
  buildFeeRows,
  resolvePriceMode,
  needsFeeComplianceNotice,
  buildListPriceFields,
} = require('./order-display')
const { isBookingOrderType } = require('./order-form')
const { getOrderAlbumImageCount } = require('./order-album-eligibility')

const MERCHANT_STATUS_LABEL = {
  [ORDER_STATUS.WAIT_ACCEPT]: '待接单',
  [ORDER_STATUS.ACCEPTED]: '待到店',
  [ORDER_STATUS.WAIT_SERVICE]: '已到店',
  [ORDER_STATUS.IN_SERVICE]: '维修中',
  [ORDER_STATUS.WAIT_CONFIRM]: '待用户确认',
  [ORDER_STATUS.COMPLETED]: '已完成',
  [ORDER_STATUS.CANCELLED]: '已取消',
  [ORDER_STATUS.CLOSED]: '已关闭',
}

function getMerchantStatusLabel(status) {
  return MERCHANT_STATUS_LABEL[status] || '—'
}

/** 相册状态：无相册任务时不展示文案（列表/详情共用） */
function resolveAlbumStatus(order) {
  if (!order || !order.hasAlbum) {
    return { key: 'none', label: '' }
  }
  if (getOrderAlbumImageCount(order) > 0) {
    return { key: 'uploaded', label: '有图片' }
  }
  return { key: 'empty', label: '待上传' }
}

function isTodayAppointment(order) {
  if (!order || !order.appointment) return false
  const appt = order.appointment
  if (appt.dateLabel && (appt.dateLabel.includes('今天') || appt.dateLabel.includes('今日'))) {
    return true
  }
  if (!appt.date) return false
  const today = new Date()
  const pad = (n) => (n < 10 ? `0${n}` : String(n))
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  return appt.date === todayStr
}

function matchesMerchantTab(order, tabKey) {
  if (!order || tabKey === 'all') return true
  const { status, refundStatus } = order

  switch (tabKey) {
    case 'waitAccept':
      return status === ORDER_STATUS.WAIT_ACCEPT
    case 'today':
      return (
        isTodayAppointment(order) &&
        status !== ORDER_STATUS.CANCELLED &&
        status !== ORDER_STATUS.CLOSED &&
        status !== ORDER_STATUS.COMPLETED
      )
    case 'waitArrive':
      return status === ORDER_STATUS.ACCEPTED
    case 'arrived':
      return status === ORDER_STATUS.WAIT_SERVICE
    case 'inService':
      return status === ORDER_STATUS.IN_SERVICE
    case 'waitConfirm':
      return status === ORDER_STATUS.WAIT_CONFIRM
    case 'afterSale':
      return (
        status === ORDER_STATUS.CANCELLED ||
        status === ORDER_STATUS.CLOSED ||
        refundStatus === REFUND_STATUS.REFUNDING ||
        refundStatus === REFUND_STATUS.REFUNDED ||
        order.aftersaleStatus === 'processing'
      )
    default:
      return true
  }
}

function filterMerchantOrdersByTab(list, tabKey) {
  return (list || []).filter((o) => matchesMerchantTab(o, tabKey))
}

function getMerchantStatusHint(order) {
  if (!order) return ''
  const { status, orderType } = order
  if (status === ORDER_STATUS.WAIT_ACCEPT) {
    return '新订单待处理，请尽快接单或说明拒单原因。'
  }
  if (status === ORDER_STATUS.ACCEPTED) {
    return '已接单，用户到店后请标记到店并开始服务。'
  }
  if (status === ORDER_STATUS.WAIT_SERVICE) {
    return '用户已到店，可开始维修并上传维修过程图片。'
  }
  if (status === ORDER_STATUS.IN_SERVICE) {
    return '维修进行中，建议上传相册节点图后再提交完工。'
  }
  if (status === ORDER_STATUS.WAIT_CONFIRM) {
    return '已提交完工，等待用户确认。如有疑问可联系用户。'
  }
  if (status === ORDER_STATUS.COMPLETED) {
    return '订单已完成，可查看评价或沉淀为案例。'
  }
  if (order.refundStatus === REFUND_STATUS.REFUNDING) {
    return '订单退款处理中，请关注后续通知。'
  }
  if (status === ORDER_STATUS.CLOSED || status === ORDER_STATUS.CANCELLED) {
    return order.rejectReasonLabel
      ? `订单已关闭：${order.rejectReasonLabel}`
      : '订单已关闭。'
  }
  if (orderType === ORDER_TYPE.ACCIDENT_BOOKING) {
    return '事故车维修方案与费用需到店检测后确认，请勿线上报价。'
  }
  return ''
}

function getMerchantListPrimaryAction(order) {
  if (!order) return null
  const { status } = order

  if (status === ORDER_STATUS.WAIT_ACCEPT) {
    return { label: '接单', actionKey: 'accept' }
  }
  if (status === ORDER_STATUS.ACCEPTED) {
    return { label: '标记到店', actionKey: 'arrive' }
  }
  if (status === ORDER_STATUS.WAIT_SERVICE) {
    return { label: '开始维修', actionKey: 'startRepair' }
  }
  if (status === ORDER_STATUS.IN_SERVICE) {
    return { label: '提交完工', actionKey: 'complete' }
  }
  if (status === ORDER_STATUS.WAIT_CONFIRM) {
    return { label: '查看详情', actionKey: 'detail' }
  }
  return { label: '查看详情', actionKey: 'detail' }
}

function getMerchantDetailBottomActions(order) {
  if (!order) return { primary: null, secondary: null }
  const { status } = order

  if (status === ORDER_STATUS.WAIT_ACCEPT) {
    return {
      primary: { label: '接单', actionKey: 'accept' },
      secondary: { label: '拒单', actionKey: 'reject', type: 'ghost' },
    }
  }
  if (status === ORDER_STATUS.ACCEPTED) {
    return {
      primary: { label: '标记到店', actionKey: 'arrive' },
      secondary: { label: '修改预约', actionKey: 'reschedule', type: 'secondary' },
    }
  }
  if (status === ORDER_STATUS.WAIT_SERVICE) {
    return {
      primary: { label: '开始维修', actionKey: 'startRepair' },
      secondary: { label: '上传相册', actionKey: 'album', type: 'secondary' },
    }
  }
  if (status === ORDER_STATUS.IN_SERVICE) {
    return {
      primary: { label: '提交完工', actionKey: 'complete' },
      secondary: { label: '上传相册', actionKey: 'album', type: 'secondary' },
    }
  }
  if (status === ORDER_STATUS.WAIT_CONFIRM) {
    return {
      primary: null,
      secondary: { label: '联系用户', actionKey: 'callUser', type: 'secondary' },
    }
  }
  if (status === ORDER_STATUS.COMPLETED) {
    return {
      primary: { label: '查看评价', actionKey: 'review', type: 'secondary' },
      secondary: { label: '创建案例', actionKey: 'createCase', type: 'ghost' },
    }
  }
  return {
    primary: { label: '联系客服', actionKey: 'support', type: 'ghost' },
    secondary: null,
  }
}

function enrichMerchantListItem(order) {
  const album = resolveAlbumStatus(order)
  return {
    ...order,
    merchantStatusLabel: getMerchantStatusLabel(order.status),
    vehicleSummary: getVehicleSummary(order.vehicle),
    appointmentText: getAppointmentText(order.appointment),
    createdAtText: formatOrderDateTime(order.createdAt),
    contactName: (order.contact && order.contact.name) || '—',
    ...buildListPriceFields(order),
    albumStatus: album.key,
    albumStatusLabel: album.label,
    primaryAction: getMerchantListPrimaryAction(order),
  }
}

function buildMerchantOrderDetail(order, store, service) {
  const storeOffShelf = store ? store.status !== 'open' : false
  const vehicle = order.vehicle || {}
  const contact = order.contact || {}
  const album = resolveAlbumStatus(order)
  const priceMode = resolvePriceMode(order, service)

  return {
    ...order,
    merchantStatusLabel: getMerchantStatusLabel(order.status),
    statusHint: getMerchantStatusHint(order),
    progressSteps: buildProgressSteps(order, { showAlbumLink: false }),
    service,
    store: store
      ? {
          id: store.id,
          name: store.name,
          address: store.address,
          phone: store.phone || '',
          businessHours: store.businessHours || '—',
        }
      : {
          name: order.storeName,
          address: '—',
          phone: '',
          businessHours: '—',
        },
    storeOffShelf,
    serviceRows: [
      { label: '服务名称', value: order.serviceName },
      { label: '服务分类', value: (service && service.categoryName) || '—' },
      { label: '订单类型', value: order.orderTypeLabel || '—' },
    ],
    userRows: [
      { label: '用户昵称', value: contact.name || '—' },
      {
        label: '手机号',
        value: contact.phoneDisplay || contact.phone || '—',
      },
    ],
    vehicleRows: [
      { label: '车辆品牌', value: vehicle.brand || '—' },
      { label: '车型', value: vehicle.series || '—' },
      { label: '车牌', value: vehicle.plateDisplay || '未填写' },
      { label: '能源类型', value: vehicle.energyType || '—' },
    ],
    appointmentRows: [
      {
        label: '预约时间',
        value: order.appointment
          ? `${order.appointment.dateLabel || ''} ${order.appointment.slot || ''}`.trim() || '—'
          : '—',
      },
    ],
    feeRows: buildFeeRows(order, service),
    priceMode,
    showFeeCompliance: needsFeeComplianceNotice(priceMode),
    metaRows: [
      { label: '订单编号', value: order.id },
      { label: '下单时间', value: formatOrderDateTime(order.createdAt) },
    ],
    problemRows: order.problemDesc
      ? [{ label: '问题描述', value: order.problemDesc }]
      : [],
    albumStatus: album.key,
    albumStatusLabel: album.label,
    logRows: (order.fulfillmentLog || []).map((log) => ({
      title: log.actionLabel || log.action,
      time: formatOrderDateTime(log.createdAt),
      remark: log.remark || log.reason || '',
    })),
    flags: {
      isAccident: order.orderType === ORDER_TYPE.ACCIDENT_BOOKING,
      isBooking: isBookingOrderType(order.orderType),
      storeOffShelf,
      canUploadAlbum:
        order.status === ORDER_STATUS.ACCEPTED ||
        order.status === ORDER_STATUS.WAIT_SERVICE ||
        order.status === ORDER_STATUS.IN_SERVICE ||
        order.hasAlbum,
      canEnterOrderAlbum:
        order.hasAlbum ||
        order.status === ORDER_STATUS.ACCEPTED ||
        order.status === ORDER_STATUS.WAIT_SERVICE ||
        order.status === ORDER_STATUS.IN_SERVICE,
    },
  }
}

function countMerchantTodos(orders) {
  const list = orders || []
  return {
    waitAccept: list.filter((o) => o.status === ORDER_STATUS.WAIT_ACCEPT).length,
    today: list.filter((o) => matchesMerchantTab(o, 'today')).length,
    inService: list.filter((o) => o.status === ORDER_STATUS.IN_SERVICE).length,
    waitComplete: list.filter((o) => o.status === ORDER_STATUS.IN_SERVICE).length,
  }
}

module.exports = {
  getMerchantStatusLabel,
  resolveAlbumStatus,
  matchesMerchantTab,
  filterMerchantOrdersByTab,
  getMerchantStatusHint,
  getMerchantListPrimaryAction,
  getMerchantDetailBottomActions,
  enrichMerchantListItem,
  buildMerchantOrderDetail,
  countMerchantTodos,
}
