/** 商家订单列表 Tab — PRD 03_订单接单与履约 §6.1 / 工作台 §6.1 */
const MERCHANT_ORDER_LIST_TABS = [
  { key: 'all', label: '全部' },
  { key: 'waitAccept', label: '待接单' },
  { key: 'today', label: '今日预约' },
  { key: 'waitArrive', label: '待到店' },
  { key: 'arrived', label: '已到店' },
  { key: 'inService', label: '维修中' },
  { key: 'waitConfirm', label: '待用户确认' },
  { key: 'afterSale', label: '售后/异常' },
]

module.exports = {
  MERCHANT_ORDER_LIST_TABS,
}
