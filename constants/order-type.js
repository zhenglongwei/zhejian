/**
 * 订单/预约类型 — 与 05_下单与支付流程.md §5.1 对齐
 */
const ORDER_TYPE = {
  STANDARD_ORDER: 'standard_order',
  INSPECTION_BOOKING: 'inspection_booking',
  ACCIDENT_BOOKING: 'accident_booking',
}

const ORDER_TYPE_LABEL = {
  [ORDER_TYPE.STANDARD_ORDER]: '标准服务订单',
  [ORDER_TYPE.INSPECTION_BOOKING]: '到店检测预约',
  [ORDER_TYPE.ACCIDENT_BOOKING]: '事故车检测预约',
}

module.exports = {
  ORDER_TYPE,
  ORDER_TYPE_LABEL,
}
