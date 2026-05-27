const { LEAD_STATUS } = require('./lead-status')

const MERCHANT_LEAD_LIST_TABS = [
  { key: 'pending', label: '待处理' },
  { key: 'contacted', label: '已联系' },
  { key: 'closed', label: '已关闭' },
]

const MERCHANT_LEAD_TAB_STATUS_MAP = {
  pending: [LEAD_STATUS.SUBMITTED, LEAD_STATUS.VIEWED],
  contacted: [LEAD_STATUS.CONTACTED],
  closed: [LEAD_STATUS.CANCELLED, LEAD_STATUS.CLOSED],
}

module.exports = {
  MERCHANT_LEAD_LIST_TABS,
  MERCHANT_LEAD_TAB_STATUS_MAP,
}
