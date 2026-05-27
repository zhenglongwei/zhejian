const {
  SEARCH_PLACEHOLDER,
  SEARCH_TABS,
  SEARCH_KEYWORD_MAX,
} = require('../../../constants/search')
const { SORT_OPTIONS, FILTER_OPTIONS } = require('../../../constants/search-filters')
const { GEO_TOPIC_TAG } = require('../../../constants/geo-pages')
const { searchContent } = require('../../../services/search')
const { addSearchHistory } = require('../../../utils/search-history')
const { inferDefaultTab } = require('../../../utils/search-intent')
const { buildStoreCardTags } = require('../../../utils/store-tags')

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
    filters: {
      supportAlbum: false,
      accidentCapable: false,
    },
    filterOptions: Object.values(FILTER_OPTIONS),
    hasActiveFilters: false,
    emptyTitle: '暂无相关结果',
    emptyDescription: '换个关键词试试，或查看热门搜索',
    emptyActionText: '返回首页',
    geoTopicTag: GEO_TOPIC_TAG,
  },

  onLoad(options) {
    const keyword = decodeURIComponent((options && options.keyword) || '')
    const tab = (options && options.tab) || inferDefaultTab(keyword)
    this.setData({
      keyword,
      activeTab: tab,
      sortOptions: SORT_OPTIONS[tab] || SORT_OPTIONS.service,
      sortKey: 'relevance',
      sortLabel: '综合',
    })
    if (keyword) {
      this.runSearch()
    } else {
      wx.redirectTo({ url: '/pages/search/index/index' })
    }
  },

  syncSortOptions(tab) {
    const sortOptions = SORT_OPTIONS[tab] || SORT_OPTIONS.service
    const sortKey = 'relevance'
    const sortLabel =
      (sortOptions.find((item) => item.key === sortKey) || sortOptions[0]).label
    this.setData({ sortOptions, sortKey, sortLabel })
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
      const result = await searchContent({
        keyword,
        tab: this.data.activeTab,
        sort: this.data.sortKey,
        filters: this.data.filters,
      })

      const merchants = (result.merchants || []).map((store) => ({
        ...store,
        cardTags: buildStoreCardTags(store, []),
      }))

      const list = result.list || []
      const geoPages = result.geoPages || []
      const hasActiveFilters =
        this.data.filters.supportAlbum || this.data.filters.accidentCapable
      const isEmpty = !list.length && !geoPages.length

      this.setData({
        geoPages,
        services: result.services || [],
        merchants,
        cases: result.cases || [],
        hotwords: result.hotwords || [],
        counts: result.counts || {},
        status: isEmpty ? 'empty' : 'normal',
        emptyDescription: hasActiveFilters
          ? '当前筛选条件下暂无结果，可尝试清空筛选'
          : '换个关键词试试，或查看热门搜索',
        emptyActionText: hasActiveFilters ? '清空筛选' : '返回首页',
        hasActiveFilters,
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
    this.syncSortOptions(key)
    this.setData({ activeTab: key }, () => this.runSearch())
  },

  onRetry() {
    this.runSearch()
  },

  onEmptyAction() {
    if (this.data.hasActiveFilters) {
      this.setData(
        {
          filters: { supportAlbum: false, accidentCapable: false },
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
    const hasActiveFilters = filters.supportAlbum || filters.accidentCapable
    this.setData({ filters, hasActiveFilters })
  },

  onApplyFilter() {
    this.setData({ filterSheetVisible: false }, () => this.runSearch())
  },

  onSortTap() {
    const { sortOptions, sortKey } = this.data
    wx.showActionSheet({
      itemList: sortOptions.map((item) => item.label),
      success: (res) => {
        const picked = sortOptions[res.tapIndex]
        if (!picked || picked.key === sortKey) return
        if (picked.requiresLocation) {
          wx.showToast({ title: '开启定位后可按距离排序', icon: 'none' })
          return
        }
        this.setData({ sortKey: picked.key, sortLabel: picked.label }, () =>
          this.runSearch()
        )
      },
    })
  },

  onHotwordTap(e) {
    const { keyword } = e.currentTarget.dataset
    this.setData({ keyword, activeTab: inferDefaultTab(keyword) }, () =>
      this.runSearch()
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
