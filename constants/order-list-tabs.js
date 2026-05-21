/** 订单列表 Tab — PRD 06 §4.2 */
const ORDER_LIST_TABS = [
  { key: 'all', label: '全部' },
  { key: 'pendingPay', label: '待支付' },
  { key: 'pendingConfirm', label: '待确认' },
  { key: 'inService', label: '服务中' },
  { key: 'waitConfirmFinish', label: '待确认完工' },
  { key: 'pendingReview', label: '待评价' },
  { key: 'refundAfterSale', label: '退款/售后' },
]

module.exports = {
  ORDER_LIST_TABS,
}
