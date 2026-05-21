const { ORDER_STATUS, ORDER_STATUS_TONE } = require('../constants/order-status')
const { ORDER_TYPE } = require('../constants/order-type')
const { PRICE_MODE } = require('../constants/price-mode')
const { formatYuan } = require('./format')
const { isBookingOrderType } = require('./order-form')

const REFUND_STATUS = {
  NONE: 'none',
  REFUNDING: 'refunding',
  REFUNDED: 'refunded',
}

function formatOrderDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n) => (n < 10 ? `0${n}` : String(n))
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getOrderStatusPresentation(status) {
  return {
    status,
    tone: ORDER_STATUS_TONE[status] || 'warning',
  }
}

function getStatusHint(order) {
  if (!order) return ''
  const { status, orderType } = order
  if (status === ORDER_STATUS.WAIT_PAY) {
    return '请在 15 分钟内完成支付，超时订单将自动关闭。'
  }
  if (status === ORDER_STATUS.WAIT_ACCEPT) {
    return isBookingOrderType(orderType)
      ? '预约已提交，门店确认后会通知你。'
      : '订单已支付，等待商家接单。'
  }
  const accidentPreService =
    orderType === ORDER_TYPE.ACCIDENT_BOOKING &&
    [
      ORDER_STATUS.WAIT_PAY,
      ORDER_STATUS.WAIT_ACCEPT,
      ORDER_STATUS.ACCEPTED,
      ORDER_STATUS.WAIT_SERVICE,
    ].includes(status)
  if (accidentPreService) {
    return '事故车维修方案和费用需到店检测或拆检后确认。'
  }
  if (status === ORDER_STATUS.IN_SERVICE) {
    return '门店正在为你的车辆服务，你可以查看维修进度和维修相册。'
  }
  if (status === ORDER_STATUS.WAIT_CONFIRM) {
    return '门店已标记完工，请确认车辆服务结果。如有问题，可申请售后。'
  }
  if (status === ORDER_STATUS.COMPLETED && order.reviewStatus === 'not_reviewed') {
    return '服务已完成，欢迎发表真实评价。'
  }
  if (order.refundStatus === REFUND_STATUS.REFUNDING) {
    return '退款处理中，可在费用信息中查看进度。'
  }
  if (status === ORDER_STATUS.CANCELLED) {
    return '订单已取消。'
  }
  if (status === ORDER_STATUS.CLOSED) {
    return '订单已关闭。'
  }
  if (order.storeOffShelf) {
    return '该门店当前暂不可预约。'
  }
  return ''
}

function getStandardProgressTemplate() {
  return [
    '订单提交',
    '支付成功',
    '商家接单',
    '用户到店',
    '开始施工',
    '维修过程',
    '门店标记完工',
    '用户确认完工',
    '评价完成',
  ]
}

function getBookingProgressTemplate() {
  return [
    '预约提交',
    '门店确认',
    '用户到店',
    '开始检测',
    '检测完成',
    '转维修订单',
  ]
}

function statusToProgressIndex(status, isBooking) {
  const mapStandard = {
    [ORDER_STATUS.CREATED]: 0,
    [ORDER_STATUS.WAIT_PAY]: 0,
    [ORDER_STATUS.WAIT_ACCEPT]: 2,
    [ORDER_STATUS.ACCEPTED]: 2,
    [ORDER_STATUS.WAIT_SERVICE]: 3,
    [ORDER_STATUS.IN_SERVICE]: 5,
    [ORDER_STATUS.WAIT_CONFIRM]: 6,
    [ORDER_STATUS.COMPLETED]: 8,
    [ORDER_STATUS.CANCELLED]: -1,
    [ORDER_STATUS.CLOSED]: -1,
  }
  const mapBooking = {
    [ORDER_STATUS.WAIT_ACCEPT]: 0,
    [ORDER_STATUS.ACCEPTED]: 1,
    [ORDER_STATUS.WAIT_SERVICE]: 2,
    [ORDER_STATUS.IN_SERVICE]: 4,
    [ORDER_STATUS.WAIT_CONFIRM]: 4,
    [ORDER_STATUS.COMPLETED]: 5,
    [ORDER_STATUS.CANCELLED]: -1,
    [ORDER_STATUS.CLOSED]: -1,
  }
  const map = isBooking ? mapBooking : mapStandard
  return map[status] != null ? map[status] : 0
}

function buildProgressSteps(order, options = {}) {
  if (!order) return []
  const { showAlbumLink = true } = options
  const isBooking = isBookingOrderType(order.orderType)
  const titles = isBooking ? getBookingProgressTemplate() : getStandardProgressTemplate()
  const activeIndex = statusToProgressIndex(order.status, isBooking)
  if (activeIndex < 0) {
    return titles.slice(0, 2).map((title, i) => ({
      title,
      status: i === 0 ? 'done' : 'pending',
      time: '',
    }))
  }

  const times = order.progressTimes || {}
  return titles.map((title, index) => {
    let status = 'pending'
    if (index < activeIndex) status = 'done'
    else if (index === activeIndex) status = 'active'
    const step = {
      title,
      status,
      time: times[title] ? formatOrderDateTime(times[title]) : '',
    }
    if (
      showAlbumLink &&
      status === 'active' &&
      order.hasAlbum &&
      (title === '维修过程' || title === '开始检测')
    ) {
      step.linkText = '查看维修相册'
    }
    return step
  })
}

function matchesTab(order, tabKey) {
  if (!order || tabKey === 'all') return true
  const { status, reviewStatus, refundStatus } = order

  switch (tabKey) {
    case 'pendingPay':
      return status === ORDER_STATUS.WAIT_PAY
    case 'pendingConfirm':
      return status === ORDER_STATUS.WAIT_ACCEPT
    case 'inService':
      return (
        status === ORDER_STATUS.ACCEPTED ||
        status === ORDER_STATUS.WAIT_SERVICE ||
        status === ORDER_STATUS.IN_SERVICE
      )
    case 'waitConfirmFinish':
      return status === ORDER_STATUS.WAIT_CONFIRM
    case 'pendingReview':
      return status === ORDER_STATUS.COMPLETED && reviewStatus === 'not_reviewed'
    case 'refundAfterSale':
      return (
        status === ORDER_STATUS.CANCELLED ||
        status === ORDER_STATUS.CLOSED ||
        refundStatus === REFUND_STATUS.REFUNDING ||
        refundStatus === REFUND_STATUS.REFUNDED
      )
    default:
      return true
  }
}

function filterOrdersByTab(list, tabKey) {
  return (list || []).filter((o) => matchesTab(o, tabKey))
}

function getVehicleSummary(vehicle) {
  if (!vehicle) return '—'
  const parts = [vehicle.brand, vehicle.series].filter(Boolean)
  const base = parts.join(' ') || '—'
  return vehicle.plateDisplay ? `${base} · ${vehicle.plateDisplay}` : base
}

function getAppointmentText(appointment) {
  if (!appointment) return '—'
  if (appointment.dateLabel && appointment.slot) {
    return `${appointment.dateLabel} ${appointment.slot}`
  }
  return appointment.slot || appointment.dateLabel || '—'
}

function getListPrimaryAction(order) {
  if (!order) return null
  const { status, orderType, reviewStatus, refundStatus } = order

  if (status === ORDER_STATUS.WAIT_PAY) {
    return { label: '去支付', actionKey: 'pay' }
  }
  if (status === ORDER_STATUS.WAIT_ACCEPT) {
    return { label: '查看详情', actionKey: 'detail' }
  }
  if (
    status === ORDER_STATUS.ACCEPTED ||
    status === ORDER_STATUS.WAIT_SERVICE
  ) {
    return { label: '查看详情', actionKey: 'detail' }
  }
  if (status === ORDER_STATUS.IN_SERVICE) {
    return { label: order.hasAlbum ? '查看相册' : '查看进度', actionKey: order.hasAlbum ? 'album' : 'detail' }
  }
  if (status === ORDER_STATUS.WAIT_CONFIRM) {
    return { label: '确认完工', actionKey: 'confirmFinish' }
  }
  if (status === ORDER_STATUS.COMPLETED && reviewStatus === 'not_reviewed') {
    return { label: '去评价', actionKey: 'review' }
  }
  if (refundStatus === REFUND_STATUS.REFUNDING) {
    return { label: '查看退款', actionKey: 'refund' }
  }
  if (status === ORDER_STATUS.CANCELLED) {
    return { label: '再次下单', actionKey: 'reorder' }
  }
  return { label: '查看详情', actionKey: 'detail' }
}

function getDetailBottomActions(order) {
  if (!order) return { primary: null, secondary: null }
  const { status, hasAlbum, reviewStatus, refundStatus } = order
  const actions = []

  if (status === ORDER_STATUS.WAIT_PAY) {
    return {
      primary: { label: '去支付', actionKey: 'pay' },
      secondary: { label: '取消订单', actionKey: 'cancel', type: 'ghost' },
    }
  }
  if (status === ORDER_STATUS.WAIT_ACCEPT) {
    return {
      primary: { label: '联系门店', actionKey: 'call' },
      secondary: { label: '取消预约', actionKey: 'cancel', type: 'ghost' },
    }
  }
  if (
    status === ORDER_STATUS.ACCEPTED ||
    status === ORDER_STATUS.WAIT_SERVICE
  ) {
    return {
      primary: { label: '导航', actionKey: 'nav' },
      secondary: { label: '联系门店', actionKey: 'call', type: 'secondary' },
    }
  }
  if (status === ORDER_STATUS.IN_SERVICE) {
    return {
      primary: hasAlbum
        ? { label: '查看维修相册', actionKey: 'album' }
        : { label: '联系门店', actionKey: 'call' },
      secondary: { label: '联系门店', actionKey: 'call', type: 'secondary' },
    }
  }
  if (status === ORDER_STATUS.WAIT_CONFIRM) {
    return {
      primary: { label: '确认完工', actionKey: 'confirmFinish' },
      secondary: { label: '申请售后', actionKey: 'aftersale', type: 'ghost' },
    }
  }
  if (status === ORDER_STATUS.COMPLETED) {
    if (reviewStatus === 'not_reviewed') {
      return {
        primary: { label: '去评价', actionKey: 'review' },
        secondary: { label: '查看维修档案', actionKey: 'archive', type: 'secondary' },
      }
    }
    return {
      primary: { label: '再次下单', actionKey: 'reorder' },
      secondary: { label: '申请售后', actionKey: 'aftersale', type: 'ghost' },
    }
  }
  if (refundStatus === REFUND_STATUS.REFUNDING) {
    return {
      primary: { label: '查看退款进度', actionKey: 'refund' },
      secondary: { label: '联系客服', actionKey: 'support', type: 'ghost' },
    }
  }
  if (status === ORDER_STATUS.CANCELLED) {
    return {
      primary: { label: '再次下单', actionKey: 'reorder' },
      secondary: null,
    }
  }

  return { primary: { label: '联系客服', actionKey: 'support' }, secondary: null }
}

function resolvePriceMode(order, service) {
  if (order.orderType === ORDER_TYPE.ACCIDENT_BOOKING) return PRICE_MODE.ACCIDENT
  if (service && service.priceMode) return service.priceMode
  if (order.priceSummary && order.priceSummary.payableAmount > 0) return PRICE_MODE.FIXED
  return PRICE_MODE.CONSULT
}

function buildFeeRows(order, service) {
  const rows = []
  const ps = order.priceSummary
  const priceMode = resolvePriceMode(order, service)

  if (priceMode === PRICE_MODE.ACCIDENT || isBookingOrderType(order.orderType)) {
    rows.push({ label: '维修费用', value: '到店检测后确认' })
    if (ps && ps.payableAmount > 0) {
      rows.push({ label: '预约检测费', value: `¥${formatYuan(ps.payableAmount)}` })
    }
    appendFeeMetaRows(rows, order)
    return rows
  }

  if (priceMode === PRICE_MODE.RANGE) {
    rows.push({ label: '维修费用', value: '到店检测后确认' })
    if (service && (service.minAmount != null || service.maxAmount != null)) {
      const min = service.minAmount
      const max = service.maxAmount
      const rangeText =
        min != null && max != null && min !== max
          ? `¥${formatYuan(min)}-¥${formatYuan(max)}`
          : `¥${formatYuan(min != null ? min : max)}`
      rows.push({ label: '参考区间', value: rangeText })
    }
    if (ps && ps.payableAmount > 0) {
      rows.push({ label: '已付金额', value: `¥${formatYuan(ps.payableAmount)}` })
    }
    appendFeeMetaRows(rows, order)
    return rows
  }

  if (priceMode === PRICE_MODE.CONSULT) {
    rows.push({ label: '维修费用', value: '到店检测后报价' })
    if (ps && ps.payableAmount > 0) {
      rows.push({ label: '已付金额', value: `¥${formatYuan(ps.payableAmount)}` })
    }
    appendFeeMetaRows(rows, order)
    return rows
  }

  if (ps) {
    if (ps.serviceAmount != null) {
      rows.push({ label: '服务金额', value: `¥${formatYuan(ps.serviceAmount)}` })
    }
    if (ps.discountAmount > 0) {
      rows.push({ label: '优惠抵扣', value: `-¥${formatYuan(ps.discountAmount)}` })
    }
    if (ps.payableAmount != null) {
      rows.push({ label: '实付金额', value: `¥${formatYuan(ps.payableAmount)}` })
    }
  }
  appendFeeMetaRows(rows, order)
  return rows
}

function appendFeeMetaRows(rows, order) {
  if (order.paidAt) {
    rows.push({ label: '支付时间', value: formatOrderDateTime(order.paidAt) })
  }
  if (order.refundStatus === REFUND_STATUS.REFUNDING) {
    rows.push({ label: '退款状态', value: '退款处理中' })
  }
  if (order.refundStatus === REFUND_STATUS.REFUNDED) {
    rows.push({ label: '退款状态', value: '已退款' })
  }
}

function needsFeeComplianceNotice(priceMode) {
  return (
    priceMode === PRICE_MODE.RANGE ||
    priceMode === PRICE_MODE.CONSULT ||
    priceMode === PRICE_MODE.ACCIDENT
  )
}

function buildListPriceFields(order) {
  const serviceMeta = {
    priceMode: order.priceMode,
    amount: order.serviceAmount,
    minAmount: order.serviceMinAmount,
    maxAmount: order.serviceMaxAmount,
  }
  const priceMode = resolvePriceMode(
    order,
    serviceMeta.priceMode ? serviceMeta : null
  )
  const ps = order.priceSummary
  const payable = ps && ps.payableAmount > 0 ? ps.payableAmount : 0

  const fields = {
    priceMode,
    serviceAmount: order.serviceAmount ?? null,
    serviceMinAmount: order.serviceMinAmount ?? null,
    serviceMaxAmount: order.serviceMaxAmount ?? null,
    showPriceDisplay: false,
    showPaidLine: false,
    paidLabel: '',
    paidAmountText: payable ? formatYuan(payable) : '',
    listPriceHint: '',
  }

  if (priceMode === PRICE_MODE.FIXED && payable > 0) {
    fields.showPaidLine = true
    fields.paidLabel = '实付'
    return fields
  }

  if (priceMode === PRICE_MODE.RANGE) {
    fields.showPriceDisplay = true
    if (payable > 0) {
      fields.showPaidLine = true
      fields.paidLabel = '已付'
      fields.listPriceHint = '实际费用以门店检测结果为准'
    }
    return fields
  }

  if (priceMode === PRICE_MODE.CONSULT || priceMode === PRICE_MODE.ACCIDENT) {
    fields.showPriceDisplay = true
    if (payable > 0) {
      fields.showPaidLine = true
      fields.paidLabel = '已付'
      fields.listPriceHint =
        priceMode === PRICE_MODE.ACCIDENT
          ? '维修费用以到店检测后确认'
          : '实际费用以门店检测结果为准'
    }
  }

  return fields
}

function enrichListItem(order) {
  return {
    ...order,
    vehicleSummary: getVehicleSummary(order.vehicle),
    appointmentText: getAppointmentText(order.appointment),
    createdAtText: formatOrderDateTime(order.createdAt),
    ...buildListPriceFields(order),
    primaryAction: getListPrimaryAction(order),
  }
}

module.exports = {
  REFUND_STATUS,
  formatOrderDateTime,
  getOrderStatusPresentation,
  getStatusHint,
  buildProgressSteps,
  filterOrdersByTab,
  matchesTab,
  getVehicleSummary,
  getAppointmentText,
  getListPrimaryAction,
  getDetailBottomActions,
  buildFeeRows,
  resolvePriceMode,
  needsFeeComplianceNotice,
  buildListPriceFields,
  enrichListItem,
}
