const { fetchCaseList } = require('../../services/case')
const { PUBLIC_AUTH_TIER } = require('../../constants/case-authorization')
const { SEARCH_PLACEHOLDER } = require('../../constants/search')
const { pickCaseDisplayCover } = require('../../utils/desensitize-url')

const FILTER_ALL = 'all'

const INTRO_BY_FILTER = {
  [FILTER_ALL]: {
    introDesc: '已脱敏、已审核的公开案例，价格均为参考区间',
    complianceType: 'casePrice',
  },
  [PUBLIC_AUTH_TIER.NAMED]: {
    introDesc: '车主实名授权公开，可展示门店与车型等品牌信息',
    complianceType: 'casePrice',
  },
  [PUBLIC_AUTH_TIER.ANONYMOUS]: {
    introDesc: '车主匿名授权公开，仅保留车辆部分信息',
    complianceType: 'casePrice',
  },
}

const FILTER_TABS = [
  { key: FILTER_ALL, label: '全部' },
  { key: PUBLIC_AUTH_TIER.NAMED, label: '实名公开' },
  { key: PUBLIC_AUTH_TIER.ANONYMOUS, label: '匿名公开' },
]

function mapCaseListItem(item) {
  if (!item) return item
  const coverImage = pickCaseDisplayCover(item)
  return { ...item, coverImage, coverImageDesensitized: coverImage }
}

Page({
  data: {
    status: 'loading',
    list: [],
    filterTabs: FILTER_TABS,
    filterSource: FILTER_ALL,
    introDesc: INTRO_BY_FILTER[FILTER_ALL].introDesc,
    complianceType: INTRO_BY_FILTER[FILTER_ALL].complianceType,
    errorMessage: '',
    searchPlaceholder: SEARCH_PLACEHOLDER,
  },

  onLoad() {
    this.loadList()
  },

  applyFilterMeta(source) {
    const meta = INTRO_BY_FILTER[source] || INTRO_BY_FILTER[FILTER_ALL]
    this.setData({
      introDesc: meta.introDesc,
      complianceType: meta.complianceType,
    })
  },

  onPullDownRefresh() {
    this.loadList().finally(() => wx.stopPullDownRefresh())
  },

  async loadList() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const query = {}
      if (this.data.filterSource !== FILTER_ALL) {
        query.authorizationTier = this.data.filterSource
      }
      const { list } = await fetchCaseList(query)
      const enriched = (list || []).map(mapCaseListItem)
      this.setData({
        list: enriched,
        status: enriched.length ? 'normal' : 'empty',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败，请重试',
      })
    }
  },

  onRetry() {
    this.loadList()
  },

  onTabChange(e) {
    const { key } = e.detail
    this.setData({ filterSource: key }, () => {
      this.applyFilterMeta(key)
      this.loadList()
    })
  },

  onCaseTap(e) {
    const { caseId } = e.detail
    wx.navigateTo({ url: `/pages/case/detail/index?id=${caseId}` })
  },

  onSearchNavigate() {
    wx.navigateTo({ url: '/pages/search/index/index' })
  },
})
