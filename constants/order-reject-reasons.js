/** 商家拒单原因 — PRD 03_订单接单与履约 §8.2 */
const ORDER_REJECT_REASONS = [
  { key: 'no_capacity', label: '当前时间无法接待' },
  { key: 'service_mismatch', label: '服务项目不匹配' },
  { key: 'vehicle_unsupported', label: '用户车型不适用' },
  { key: 'store_closed', label: '门店临时停业' },
  { key: 'capability_unsupported', label: '资质或能力不支持' },
  { key: 'other', label: '其他原因' },
]

module.exports = {
  ORDER_REJECT_REASONS,
}
