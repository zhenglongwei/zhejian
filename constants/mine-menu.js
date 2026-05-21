/** 我的页 — 订单快捷入口（PRD §10） */
const MINE_ORDER_SHORTCUTS = [
  { key: 'pendingPay', label: '待支付', status: 'pending_pay' },
  { key: 'pendingConfirm', label: '待确认', status: 'pending_confirm' },
  { key: 'inService', label: '服务中', status: 'in_service' },
  { key: 'pendingReview', label: '待评价', status: 'pending_review' },
  { key: 'refundAfterSale', label: '退款/售后', status: 'refund_after_sale' },
  { key: 'all', label: '全部订单', status: 'all' },
]

/** 需登录拦截的功能入口（PRD §23.2） */
const MINE_PROTECTED_MENUS = [
  { key: 'vehicles', label: '我的车辆', needPhone: false },
  { key: 'archive', label: '我的维修档案', needPhone: false },
  { key: 'reviews', label: '我的评价', needPhone: false },
  { key: 'rewards', label: '奖励中心', needPhone: false, desc: '查看奖励记录' },
  { key: 'coupons', label: '优惠券', needPhone: false },
  { key: 'settings', label: '设置', needPhone: false },
]

/** 未登录也可访问 */
const MINE_PUBLIC_MENUS = [
  { key: 'support', label: '联系客服' },
  { key: 'rules', label: '平台规则' },
  { key: 'about', label: '关于平台' },
]

module.exports = {
  MINE_ORDER_SHORTCUTS,
  MINE_PROTECTED_MENUS,
  MINE_PUBLIC_MENUS,
}
