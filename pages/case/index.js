const { fetchCaseList } = require('../../services/case')
const { PUBLIC_AUTH_TIER } = require('../../constants/case-authorization')
const { SEARCH_PLACEHOLDER } = require('../../constants/search')
const { pickCaseDisplayCover } = require('../../utils/desensitize-url')
const { resolvePageShareContext, withStoreContextPath } = require('../../utils/share-store-context')

const FILTER_ALL = 'all'

const INTRO_BY_FILTER = {
  [FILTER_ALL]: {
    introDesc: '已脱敏、已审核的公开案例；车主授权公示的展示方案报价，其余为参考区间',
  },
  [PUBLIC_AUTH_TIER.NAMED]: {
    introDesc: '车主实名授权公示，可展示门店与车型等品牌信息',
  },
  [PUBLIC_AUTH_TIER.ANONYMOUS]: {
    introDesc: '车主匿名授权公示，仅保留车辆部分信息',
  },
}

const INTRO_BY_FILTER_STORE = {
  [FILTER_ALL]: {
    introDesc: '本店授权公示案例，仅供了解该门店维修能力',
  },
  [PUBLIC_AUTH_TIER.NAMED]: {
    introDesc: '本店实名授权公示，可展示门店与车型等品牌信息',
  },
  [PUBLIC_AUTH_TIER.ANONYMOUS]: {
    introDesc: '本店匿名授权公示，仅保留车辆部分信息',
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
    errorMessage: '',
    searchPlaceholder: SEARCH_PLACEHOLDER,
    storeIsolated: false,
    storeId: '',
    introTitle: '公开维修案例',
    emptyTitle: '暂无公开案例',
    emptyDescription: '服务相册授权公示后将展示在此',
  },

  onLoad(options) {
    const shareCtx = resolvePageShareContext(options, {
      storeId: options.storeId || '',
      source: 'case_list',
      autoIsolate: Boolean(options.storeId),
    })
    this.storeId = shareCtx.storeId || options.storeId || ''
    const storeIsolated = Boolean(this.storeId)
    this.setData({
      storeIsolated: shareCtx.isolated,
      storeId: this.storeId,
      introTitle: storeIsolated ? '本店公开案例' : '公开维修案例',
      emptyTitle: storeIsolated ? '本店暂无公开案例' : '暂无公开案例',
      emptyDescription: storeIsolated
        ? '授权公示通过后将展示在此'
        : '服务相册授权公示后将展示在此',
    })
    this.applyFilterMeta(this.data.filterSource)
    this.loadList()
  },

  applyFilterMeta(source) {
    const pool = this.data.storeIsolated ? INTRO_BY_FILTER_STORE : INTRO_BY_FILTER
    const meta = pool[source] || pool[FILTER_ALL]
    this.setData({
      introDesc: meta.introDesc,
    })
  },

  onPullDownRefresh() {
    this.loadList().finally(() => wx.stopPullDownRefresh())
  },

  async loadList(options = {}) {
    const silent = options.silent === true
    if (!silent) {
      this.setData({ status: 'loading', errorMessage: '' })
    }
    try {
      const query = {}
      if (this.data.filterSource !== FILTER_ALL) {
        query.authorizationTier = this.data.filterSource
      }
      if (this.storeId) {
        query.storeId = this.storeId
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
      this.loadList({ silent: true })
    })
  },

  onCaseTap(e) {
    const caseId = e.detail && e.detail.caseId
    if (!caseId || this._caseNavigating) return
    this._caseNavigating = true
    wx.navigateTo({
      url: withStoreContextPath(`/pages/case/detail/index?id=${caseId}`, {
        storeId: this.storeId,
      }),
      complete: () => {
        this._caseNavigating = false
      },
    })
  },

  onSearchNavigate() {
    if (this.data.storeIsolated) return
    wx.navigateTo({ url: '/pages/search/index/index' })
  },
})
