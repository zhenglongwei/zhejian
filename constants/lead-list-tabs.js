const { LEAD_STATUS } = require('./lead-status')

const LEAD_LIST_TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待联系' },
  { key: 'contacted', label: '已联系' },
  { key: 'closed', label: '已关闭' },
]

const LEAD_TAB_STATUS_MAP = {
  all: null,
  pending: [LEAD_STATUS.SUBMITTED, LEAD_STATUS.VIEWED],
  contacted: [LEAD_STATUS.CONTACTED],
  closed: [LEAD_STATUS.CANCELLED, LEAD_STATUS.CLOSED],
}

module.exports = {
  LEAD_LIST_TABS,
  LEAD_TAB_STATUS_MAP,
}
