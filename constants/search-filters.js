/** 搜索筛选与排序 — V2.0 P0（无评分/销量/在线支付） */
const { SERVICE_CATEGORIES } = require('./service')
const { PUBLIC_AUTH_TIER } = require('./case-authorization')

const DEFAULT_CITY = {
  code: 'hangzhou',
  name: '杭州',
}

const SORT_OPTIONS = {
  all: [{ key: 'relevance', label: '综合' }],
  service: [
    { key: 'relevance', label: '综合' },
    { key: 'price_asc', label: '价格从低到高' },
    { key: 'price_desc', label: '价格从高到低' },
  ],
  merchant: [
    { key: 'relevance', label: '综合' },
    { key: 'distance', label: '距离最近', requiresLocation: true },
    { key: 'case_count', label: '案例数优先' },
  ],
  case: [
    { key: 'relevance', label: '综合' },
    { key: 'latest', label: '最新发布' },
  ],
}

const TOGGLE_FILTERS = {
  supportAlbum: { key: 'supportAlbum', label: '支持服务相册', tabs: ['merchant'] },
  openNow: { key: 'openNow', label: '营业中', tabs: ['merchant'] },
  accidentCapable: {
    key: 'accidentCapable',
    label: '事故车能力',
    tabs: ['merchant', 'service'],
  },
}

const DISTANCE_KM_OPTIONS = [
  { value: '', label: '不限距离' },
  { value: '1', label: '1km 内' },
  { value: '3', label: '3km 内' },
  { value: '5', label: '5km 内' },
  { value: '10', label: '10km 内' },
]

const CATEGORY_OPTIONS = [
  { value: '', label: '全部分类' },
  ...SERVICE_CATEGORIES.map((c) => ({ value: c.id, label: c.name })),
]

const CASE_AUTH_OPTIONS = [
  { value: '', label: '全部公开方式' },
  { value: PUBLIC_AUTH_TIER.NAMED, label: '实名授权' },
  { value: PUBLIC_AUTH_TIER.ANONYMOUS, label: '匿名授权' },
]

/** 案例按服务分类筛选时的关键词（匹配 serviceName） */
const CATEGORY_CASE_KEYWORDS = {
  cat_maintenance: ['保养', '机油'],
  cat_brake: ['刹车'],
  cat_tire: ['轮胎'],
  cat_battery: ['电瓶', '蓄电池'],
  cat_body: ['钣喷', '喷漆', '补漆', '漆面'],
  cat_accident: ['事故'],
}

function createEmptyFilters() {
  return {
    supportAlbum: false,
    openNow: false,
    accidentCapable: false,
    categoryId: '',
    maxDistanceKm: '',
    authorizationTier: '',
  }
}

function hasActiveFilters(filters = {}) {
  if (!filters) return false
  if (filters.supportAlbum || filters.openNow || filters.accidentCapable) return true
  if (filters.categoryId) return true
  if (filters.maxDistanceKm) return true
  if (filters.authorizationTier) return true
  return false
}

function getFilterSections(tab) {
  if (tab === 'all') return []

  const sections = []

  const toggles = Object.values(TOGGLE_FILTERS).filter((item) =>
    item.tabs.includes(tab)
  )
  toggles.forEach((item) => {
    sections.push({ type: 'toggle', key: item.key, label: item.label })
  })

  if (tab === 'service' || tab === 'case') {
    sections.push({
      type: 'select',
      key: 'categoryId',
      label: '服务分类',
      options: CATEGORY_OPTIONS,
    })
  }

  if (tab === 'merchant') {
    sections.push({
      type: 'select',
      key: 'maxDistanceKm',
      label: '距离范围',
      options: DISTANCE_KM_OPTIONS,
      requiresLocation: true,
    })
  }

  if (tab === 'case') {
    sections.push({
      type: 'select',
      key: 'authorizationTier',
      label: '公开方式',
      options: CASE_AUTH_OPTIONS,
    })
  }

  return sections
}

function getCategoryCaseKeywords(categoryId) {
  return CATEGORY_CASE_KEYWORDS[categoryId] || []
}

/** @deprecated 兼容旧引用 */
const FILTER_OPTIONS = TOGGLE_FILTERS

module.exports = {
  DEFAULT_CITY,
  SORT_OPTIONS,
  FILTER_OPTIONS,
  TOGGLE_FILTERS,
  DISTANCE_KM_OPTIONS,
  CATEGORY_OPTIONS,
  CASE_AUTH_OPTIONS,
  CATEGORY_CASE_KEYWORDS,
  createEmptyFilters,
  hasActiveFilters,
  getFilterSections,
  getCategoryCaseKeywords,
}

