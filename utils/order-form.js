const { PRICE_MODE } = require('../constants/price-mode')
const { ORDER_TYPE } = require('../constants/order-type')

function resolveOrderType(priceMode) {
  if (priceMode === PRICE_MODE.FIXED) return ORDER_TYPE.STANDARD_ORDER
  if (priceMode === PRICE_MODE.ACCIDENT) return ORDER_TYPE.ACCIDENT_BOOKING
  return ORDER_TYPE.INSPECTION_BOOKING
}

function isBookingOrderType(orderType) {
  return (
    orderType === ORDER_TYPE.INSPECTION_BOOKING ||
    orderType === ORDER_TYPE.ACCIDENT_BOOKING
  )
}

function getSubmitButtonLabel(orderType) {
  if (orderType === ORDER_TYPE.STANDARD_ORDER) return '提交并支付'
  return '提交预约'
}

function getConfirmPageTitle(orderType) {
  if (orderType === ORDER_TYPE.STANDARD_ORDER) return '确认订单'
  return '预约确认'
}

/**
 * @param {object} form
 * @param {string} orderType
 * @returns {{ ok: true } | { ok: false, message: string, field?: string }}
 */
function validateConfirmForm(form, orderType) {
  if (!form.brand || !String(form.brand).trim()) {
    return { ok: false, message: '请填写车辆品牌', field: 'brand' }
  }
  if (!form.series || !String(form.series).trim()) {
    return { ok: false, message: '请填写车型', field: 'series' }
  }
  if (!form.contactName || !String(form.contactName).trim()) {
    return { ok: false, message: '请填写联系人称呼', field: 'contactName' }
  }
  if (!form.appointmentDate || !form.appointmentSlot) {
    return { ok: false, message: '请选择预约时间', field: 'appointment' }
  }
  if (
    orderType === ORDER_TYPE.ACCIDENT_BOOKING &&
    !form.liabilityAccepted
  ) {
    return {
      ok: false,
      message: '请先确认已知晓事故车检测报价规则',
      field: 'liability',
    }
  }
  return { ok: true }
}

function maskPlate(plate) {
  if (!plate || !String(plate).trim()) return ''
  const raw = String(plate).trim()
  if (raw.length <= 4) return raw
  if (raw.length >= 7) {
    return `${raw.slice(0, 2)}****${raw.slice(-1)}`
  }
  return `${raw.slice(0, 1)}****${raw.slice(-1)}`
}

module.exports = {
  resolveOrderType,
  isBookingOrderType,
  getSubmitButtonLabel,
  getConfirmPageTitle,
  validateConfirmForm,
  maskPlate,
}
