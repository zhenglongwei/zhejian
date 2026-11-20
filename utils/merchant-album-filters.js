/**
 * 商家端服务相册筛选（2026-11-20）
 * 列表顶部收成一颗搜索框：点它向下展开筛选托盘，输入与选档都即时生效。
 * 输入是 utils/merchant-workbench-home 的 presentAlbumCard 产物，纯本地计算，不走网络。
 */
const { normalizeMerchantServiceAlbumListTab } = require('../constants/service-album-status')

const MERCHANT_ALBUM_FILTER_DIMS = [
  {
    key: 'progress',
    label: '服务进度',
    options: [
      { key: 'all', label: '全部', test: () => true },
      { key: 'active', label: '进行中', test: (card) => !card.repairDone },
      { key: 'done', label: '已完成', test: (card) => Boolean(card.repairDone) },
    ],
  },
  {
    key: 'public',
    label: '公开状态',
    options: [
      { key: 'all', label: '全部', test: () => true },
      // publicOnSite 真值是「访客现在就能在网站上打开」，所以这一档叫已公开，不叫可公开
      { key: 'off', label: '未公开', test: (card) => !card.publicOnSite },
      { key: 'on', label: '已公开', test: (card) => Boolean(card.publicOnSite) },
    ],
  },
  {
    key: 'review',
    label: '车主评价',
    options: [
      { key: 'all', label: '全部', test: () => true },
      {
        key: 'pending',
        label: '待评价',
        test: (card) => Boolean(card.repairDone) && card.reviewStatus === 'not_reviewed',
      },
      {
        key: 'reviewed',
        label: '已评价',
        test: (card) => Boolean(card.repairDone) && card.reviewStatus !== 'not_reviewed',
      },
    ],
  },
]

function defaultMerchantAlbumFilters() {
  const filters = {}
  MERCHANT_ALBUM_FILTER_DIMS.forEach((dim) => {
    filters[dim.key] = 'all'
  })
  return filters
}

function normalizeMerchantAlbumFilters(partial) {
  const source = partial || {}
  const filters = {}
  MERCHANT_ALBUM_FILTER_DIMS.forEach((dim) => {
    const value = String(source[dim.key] || 'all')
    filters[dim.key] = dim.options.some((option) => option.key === value) ? value : 'all'
  })
  return filters
}

function matchesMerchantAlbumFilters(card, filters) {
  const picked = normalizeMerchantAlbumFilters(filters)
  return MERCHANT_ALBUM_FILTER_DIMS.every((dim) => {
    const option = dim.options.find((item) => item.key === picked[dim.key])
    return option.test(card)
  })
}

function matchesMerchantAlbumKeyword(card, keyword) {
  const q = String(keyword || '').trim().toLowerCase()
  if (!q) return true
  const haystack = String(card.searchText || '')
  return q.split(/\s+/).every((token) => haystack.indexOf(token) >= 0)
}

/**
 * 分面计数：某一维的各档数字 = 其余维已选条件命中后、该档还剩多少。
 * 这样选完「进行中」再看「已公开」不会继续显示全量 13，点下去也就不会撞上空列表。
 */
function buildMerchantAlbumFilterGroups(cards, filters) {
  const picked = normalizeMerchantAlbumFilters(filters)
  const list = cards || []
  return MERCHANT_ALBUM_FILTER_DIMS.map((dim) => ({
    key: dim.key,
    label: dim.label,
    selected: picked[dim.key],
    options: dim.options.map((option) => ({
      key: option.key,
      label: option.label,
      count: list.filter((card) => {
        const othersMatch = MERCHANT_ALBUM_FILTER_DIMS.every((other) => {
          if (other.key === dim.key) return true
          const otherOption = other.options.find((item) => item.key === picked[other.key])
          return otherOption.test(card)
        })
        return othersMatch && option.test(card)
      }).length,
    })),
  }))
}

/** 已选条件摘要，用于搜索框内挂出可单独摘除的小标 */
function summarizeMerchantAlbumFilters(filters) {
  const picked = normalizeMerchantAlbumFilters(filters)
  const tags = []
  MERCHANT_ALBUM_FILTER_DIMS.forEach((dim) => {
    const value = picked[dim.key]
    if (value === 'all') return
    const option = dim.options.find((item) => item.key === value)
    tags.push({ dim: dim.key, label: option.label })
  })
  return tags
}

/**
 * 旧链接只带 tab（工作台、看板、消息都这么跳）；新链接可以直接带三维。
 */
function merchantAlbumFiltersFromQuery(options = {}) {
  const filters = defaultMerchantAlbumFilters()
  const legacyTab = normalizeMerchantServiceAlbumListTab(options.tab)
  if (legacyTab !== 'all') filters.progress = legacyTab
  return normalizeMerchantAlbumFilters({
    ...filters,
    progress: options.progress || filters.progress,
    public: options.public,
    review: options.review,
  })
}

module.exports = {
  MERCHANT_ALBUM_FILTER_DIMS,
  defaultMerchantAlbumFilters,
  normalizeMerchantAlbumFilters,
  matchesMerchantAlbumFilters,
  matchesMerchantAlbumKeyword,
  buildMerchantAlbumFilterGroups,
  summarizeMerchantAlbumFilters,
  merchantAlbumFiltersFromQuery,
}
