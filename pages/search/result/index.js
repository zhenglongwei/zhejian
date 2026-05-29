const {
  SEARCH_PLACEHOLDER,
  SEARCH_TABS,
  SEARCH_KEYWORD_MAX,
} = require('../../../constants/search')
const {
  SORT_OPTIONS,
  createEmptyFilters,
  hasActiveFilters,
  getFilterSections,
} = require('../../../constants/search-filters')
const { GEO_TOPIC_TAG } = require('../../../constants/geo-pages')
const { searchContent } = require('../../../services/search')
const { addSearchHistory } = require('../../../utils/search-history')
const { inferDefaultTab } = require('../../../utils/search-intent')
const { buildStoreCardTags } = require('../../../utils/store-tags')
const { resolveCityContext } = require('../../../utils/city-location')

const TAB_LABEL = {
  service: '服务',
  merchant: '门店',
  case: '案例',
}

function getTabList(tab, services, merchants, cases) {
  if (tab === 'merchant') return merchants
  if (tab === 'case') return cases
  return services
}

function isPageEmpty(counts, geoPages) {
  const c = counts || {}
  return (
    !(c.service || 0) &&
    !(c.merchant || 0) &&
    !(c.case || 0) &&
    !(geoPages || []).length
  )
}

function buildTabEmptyHint(activeTab, counts) {
  const c = counts || {}
  const parts = []
  if (activeTab !== 'service' && c.service) {
    parts.push(`${TAB_LABEL.service} ${c.service} 条`)
  }
  if (activeTab !== 'merchant' && c.merchant) {
    parts.push(`${TAB_LABEL.merchant} ${c.merchant} 条`)
  }
  if (activeTab !== 'case' && c.case) {
    parts.push(`${TAB_LABEL.case} ${c.case} 条`)
  }
  if (!parts.length) return ''
  return `可切换上方标签查看：${parts.join('、')}`
}

Page({
  data: {
    placeholder: SEARCH_PLACEHOLDER,
    keyword: '',
    tabs: SEARCH_TABS,
    activeTab: 'service',
    status: 'loading',
    errorMessage: '',
    geoPages: [],
    services: [],
    merchants: [],
    cases: [],
    hotwords: [],
    counts: {},
    sortOptions: [],
    sortKey: 'relevance',
    sortLabel: '综合',
    filterSheetVisible: false,
    filters: createEmptyFilters(),
    filterSections: [],
    hasActiveFilters: false,
    locationGranted: false,
    emptyTitle: '暂无相关结果',
    emptyDescription: '换个关键词试试，或查看热门搜索',
    emptyActionText: '返回首页',
    geoTopicTag: GEO_TOPIC_TAG,
    showTabEmpty: false,
    tabEmptyHint: '',
  },

  onLoad(options) {
    const keyword = decodeURIComponent((options && options.keyword) || '')
    const tab = (options && options.tab) || inferDefaultTab(keyword)
    this.setData({
      keyword,
      activeTab: tab,
    })
    this.syncSortOptions(tab)
    this.syncFilterSections(tab)
    if (keyword) {
      this.bootstrapSearch()
    } else {
      wx.redirectTo({ url: '/pages/search/index/index' })
    }
  },

  async bootstrapSearch() {
    const ctx = await resolveCityContext()
    this.coords = ctx.coords
    this.setData({ locationGranted: ctx.locationGranted })
    this.runSearch()
  },

  syncSortOptions(tab) {
    const sortOptions = SORT_OPTIONS[tab] || SORT_OPTIONS.service
    const sortKey = 'relevance'
    const sortLabel =
      (sortOptions.find((item) => item.key === sortKey) || sortOptions[0]).label
    this.setData({ sortOptions, sortKey, sortLabel })
  },

  syncFilterSections(tab) {
    this.setData({ filterSections: getFilterSections(tab) })
  },

  async ensureLocationForAction(actionLabel) {
    if (this.data.locationGranted && this.coords) return true
    return new Promise((resolve) => {
      wx.showModal({
        title: '开启定位',
        content: `开启定位后可使用${actionLabel}`,
        confirmText: '去开启',
        success: async (res) => {
          if (!res.confirm) {
            resolve(false)
            return
          }
          const ctx = await resolveCityContext()
          this.coords = ctx.coords
          this.setData({ locationGranted: ctx.locationGranted })
          if (!ctx.locationGranted) {
            wx.showToast({ title: '暂未获取定位', icon: 'none' })
          }
          resolve(ctx.locationGranted)
        },
        fail: () => resolve(false),
      })
    })
  },

  async runSearch() {
    const keyword = String(this.data.keyword || '').trim()
    if (!keyword) {
      this.setData({ status: 'empty' })
      return
    }
    if (keyword.length > SEARCH_KEYWORD_MAX) {
      wx.showToast({
        title: `关键词不超过 ${SEARCH_KEYWORD_MAX} 字`,
        icon: 'none',
      })
      return
    }

    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const query = {
        keyword,
        tab: this.data.activeTab,
        sort: this.data.sortKey,
        filters: this.data.filters,
      }
      if (this.coords) {
        query.coords = this.coords
      }

      const result = await searchContent(query)

      const merchants = (result.merchants || []).map((store) => ({
        ...store,
        cardTags: buildStoreCardTags(store, []),
      }))

      const geoPages = result.geoPages || []
      const services = result.services || []
      const cases = result.cases || []
      const counts = result.counts || {}
      const activeTab = this.data.activeTab
      const tabList = getTabList(activeTab, services, merchants, cases)
      const activeFilters = hasActiveFilters(this.data.filters)
      const pageEmpty = isPageEmpty(counts, geoPages)
      const showTabEmpty = !pageEmpty && !tabList.length

      this.setData({
        geoPages,
        services,
        merchants,
        cases,
        hotwords: result.hotwords || [],
        counts,
        status: pageEmpty ? 'empty' : 'normal',
        showTabEmpty,
        tabEmptyHint: showTabEmpty ? buildTabEmptyHint(activeTab, counts) : '',
        emptyDescription: activeFilters
          ? '当前筛选条件下暂无结果，可尝试清空筛选'
          : '换个关键词试试，或查看热门搜索',
        emptyActionText: activeFilters ? '清空筛选' : '返回首页',
        hasActiveFilters: activeFilters,
      })
      addSearchHistory(keyword)
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '搜索失败，请重试',
      })
    }
  },

  onInput(e) {
    this.setData({ keyword: (e.detail && e.detail.value) || '' })
  },

  onClear() {
    this.setData({ keyword: '' })
  },

  onCancel() {
    wx.navigateBack({
      fail() {
        wx.switchTab({ url: '/pages/home/index' })
      },
    })
  },

  onConfirm(e) {
    const keyword = (e.detail && e.detail.value) || this.data.keyword
    this.setData({ keyword })
    this.runSearch()
  },

  onTabChange(e) {
    const { key } = e.detail
    if (key === this.data.activeTab) return
    this.tabLockedByUser = true
    this.syncSortOptions(key)
    this.syncFilterSections(key)
    this.setData(
      {
        activeTab: key,
        filters: createEmptyFilters(),
        hasActiveFilters: false,
      },
      () => this.runSearch()
    )
  },

  onRetry() {
    this.runSearch()
  },

  onEmptyAction() {
    if (this.data.hasActiveFilters) {
      this.setData(
        {
          filters: createEmptyFilters(),
          hasActiveFilters: false,
        },
        () => this.runSearch()
      )
      return
    }
    wx.switchTab({ url: '/pages/home/index' })
  },

  onOpenFilter() {
    this.setData({ filterSheetVisible: true })
  },

  onCloseFilter() {
    this.setData({ filterSheetVisible: false })
  },

  onToggleFilter(e) {
    const { key } = e.currentTarget.dataset
    const filters = { ...this.data.filters, [key]: !this.data.filters[key] }
    this.setData({
      filters,
      hasActiveFilters: hasActiveFilters(filters),
    })
  },

  async onSelectFilter(e) {
    const { key, value } = e.currentTarget.dataset
    const section = (this.data.filterSections || []).find((item) => item.key === key)
    if (section && section.requiresLocation && value) {
      const ok = await this.ensureLocationForAction('距离筛选')
      if (!ok) return
    }
    const filters = { ...this.data.filters, [key]: value }
    this.setData({
      filters,
      hasActiveFilters: hasActiveFilters(filters),
    })
  },

  onApplyFilter() {
    this.setData({ filterSheetVisible: false }, () => this.runSearch())
  },

  async onSortTap() {
    const { sortOptions, sortKey } = this.data
    wx.showActionSheet({
      itemList: sortOptions.map((item) => item.label),
      success: async (res) => {
        const picked = sortOptions[res.tapIndex]
        if (!picked || picked.key === sortKey) return
        if (picked.requiresLocation) {
          const ok = await this.ensureLocationForAction('距离排序')
          if (!ok) return
        }
        this.setData({ sortKey: picked.key, sortLabel: picked.label }, () =>
          this.runSearch()
        )
      },
    })
  },

  onHotwordTap(e) {
    const { keyword } = e.currentTarget.dataset
    const tab = inferDefaultTab(keyword)
    this.syncSortOptions(tab)
    this.syncFilterSections(tab)
    this.setData(
      {
        keyword,
        activeTab: tab,
        filters: createEmptyFilters(),
        hasActiveFilters: false,
      },
      () => this.runSearch()
    )
  },

  onGeoTap(e) {
    const id = (e.detail && e.detail.topicId) || e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/geo/detail/index?id=${id}` })
  },

  onServiceTap(e) {
    const { serviceId } = e.detail
    wx.navigateTo({ url: `/pages/service/detail/index?id=${serviceId}` })
  },

  onStoreTap(e) {
    const storeId = (e.detail && e.detail.storeId) || e.currentTarget.dataset.storeId
    if (!storeId) return
    wx.navigateTo({ url: `/pages/store/detail/index?id=${storeId}` })
  },

  onCaseTap(e) {
    const { caseId } = e.detail
    wx.navigateTo({ url: `/pages/case/detail/index?id=${caseId}` })
  },
})

