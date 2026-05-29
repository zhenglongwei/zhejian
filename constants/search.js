/** 搜索 — V2.0 P0 常量 */
const SEARCH_PLACEHOLDER = '搜索服务、门店、车型、故障或案例'

const SEARCH_HISTORY_KEY = 'search_history_v1'
const SEARCH_HISTORY_MAX = 10
const SEARCH_KEYWORD_MAX = 30

const SEARCH_TABS = [
  { key: 'all', label: '全部' },
  { key: 'service', label: '服务' },
  { key: 'merchant', label: '门店' },
  { key: 'case', label: '案例' },
]

const SEARCH_DEFAULT_TAB = 'all'

const SEARCH_TAB_KEYS = SEARCH_TABS.map((item) => item.key)

const SUGGEST_TYPE_LABEL = {
  service: '服务',
  merchant: '门店',
  case: '案例',
  geo: '专题',
  symptom: '症状',
  vehicle: '车型',
}

module.exports = {
  SEARCH_PLACEHOLDER,
  SEARCH_HISTORY_KEY,
  SEARCH_HISTORY_MAX,
  SEARCH_KEYWORD_MAX,
  SEARCH_TABS,
  SEARCH_DEFAULT_TAB,
  SEARCH_TAB_KEYS,
  SUGGEST_TYPE_LABEL,
}
