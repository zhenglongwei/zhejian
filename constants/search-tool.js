/** DS-D-08 · 小程序搜索收窄（相册码 / 本店） */
const TOOL_SEARCH_ALBUM_PLACEHOLDER = '输入相册码，如 alb_xxx'
const TOOL_SEARCH_STORE_PLACEHOLDER = '搜索本店服务或案例'

const TOOL_SEARCH_MIGRATED_HINT =
  '全站搜索已迁移至辙见内容站。此处仅支持相册码查询；分享本店链可搜索该店服务与案例。'

const STORE_SEARCH_TABS = [
  { key: 'all', label: '全部' },
  { key: 'service', label: '服务' },
  { key: 'case', label: '案例' },
]

const STORE_SEARCH_TAB_KEYS = STORE_SEARCH_TABS.map((item) => item.key)

module.exports = {
  TOOL_SEARCH_ALBUM_PLACEHOLDER,
  TOOL_SEARCH_STORE_PLACEHOLDER,
  TOOL_SEARCH_MIGRATED_HINT,
  STORE_SEARCH_TABS,
  STORE_SEARCH_TAB_KEYS,
}
