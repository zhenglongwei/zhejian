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

const MERCHANT_LEAD_LIST_EMPTY_COPY = {
  pending: {
    title: '暂无线索',
    description: '用户提交咨询或预约后，待处理线索会出现在这里',
  },
  contacted: {
    title: '暂无线索',
    description: '标记已联系后的线索会出现在这里',
  },
  closed: {
    title: '暂无线索',
    description: '已关闭或用户取消的线索会出现在这里',
  },
}

function resolveMerchantLeadListEmptyCopy(tab) {
  return MERCHANT_LEAD_LIST_EMPTY_COPY[tab] || MERCHANT_LEAD_LIST_EMPTY_COPY.pending
}

module.exports = {
  MERCHANT_LEAD_LIST_TABS,
  MERCHANT_LEAD_TAB_STATUS_MAP,
  MERCHANT_LEAD_LIST_EMPTY_COPY,
  resolveMerchantLeadListEmptyCopy,
}
