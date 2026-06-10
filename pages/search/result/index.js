const {
  SEARCH_DEFAULT_TAB,
  SEARCH_KEYWORD_MAX,
} = require('../../../constants/search')
const {
  TOOL_SEARCH_STORE_PLACEHOLDER,
  STORE_SEARCH_TABS,
  STORE_SEARCH_TAB_KEYS,
} = require('../../../constants/search-tool')
const {
  SORT_OPTIONS,
  createEmptyFilters,
  hasActiveFilters,
  getFilterSections,
} = require('../../../constants/search-filters')
const { searchContent } = require('../../../services/search')
const { isAlbumCodeInput } = require('../../../utils/search-tool')
const { navigateFromAlbumCode } = require('../../../utils/tool-scan')
const {
  resolvePageShareContext,
  getShareStoreId,
  withStoreContextPath,
} = require('../../../utils/share-store-context')
const { addSearchHistory } = require('../../../utils/search-history')
const { buildStoreCardTags } = require('../../../utils/store-tags')
const { resolveCityContext } = require('../../../utils/city-location')
const { PRICE_MODE } = require('../../../constants/price-mode')

const TAB_LABEL = {
  all: '全部',
  service: '服务',
  merchant: '门店',
  case: '案例',
}

function getTabList(tab, services, merchants, cases) {
  if (tab === 'all') {
    return [...(services || []), ...(merchants || []), ...(cases || [])]
  }
  if (tab === 'merchant') return merchants
  if (tab === 'case') return cases
  return services
}

function isPageEmpty(services, merchants, cases, counts) {
  if ((services || []).length) return false
  if ((merchants || []).length) return false
  if ((cases || []).length) return false
  const c = counts || {}
  return !(c.service || 0) && !(c.merchant || 0) && !(c.case || 0)
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

function resolveServiceComplianceNotices(services) {
  const list = services || []
  return {
    showServicePriceNotice: list.some(
      (item) =>
        item.priceMode === PRICE_MODE.FIXED || item.priceMode === PRICE_MODE.RANGE
    ),
    showServiceAccidentNotice: list.some(
      (item) => item.priceMode === PRICE_MODE.ACCIDENT
    ),
  }
}

Page({
  data: {
    placeholder: TOOL_SEARCH_STORE_PLACEHOLDER,
    keyword: '',
    tabs: STORE_SEARCH_TABS,
    activeTab: SEARCH_DEFAULT_TAB,
    storeSearchMode: true,
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
    emptyTitle: '本店暂无相关结果',
    emptyDescription: '换个关键词试试，或返回查询页',
    emptyActionText: '返回查询页',
    showTabEmpty: false,
    tabEmptyHint: '',
    showServicePriceNotice: false,
    showServiceAccidentNotice: false,
  },

  onLoad(options) {
    const ctx = resolvePageShareContext(options || {}, {
      storeId: (options && options.storeId) || '',
      autoIsolate: Boolean(options && options.storeId),
    })
    this.storeId =
      (options && options.storeId) || ctx.storeId || getShareStoreId() || ''
    const keyword = decodeURIComponent((options && options.keyword) || '')

    if (!this.storeId) {
      if (keyword && isAlbumCodeInput(keyword)) {
        navigateFromAlbumCode(keyword)
        return
      }
      wx.redirectTo({ url: '/pages/search/index/index' })
      return
    }

    const tab =
      options && STORE_SEARCH_TAB_KEYS.includes(options.tab)
        ? options.tab
        : SEARCH_DEFAULT_TAB
    wx.setNavigationBarTitle({ title: '本店搜索' })
    this.setData({
      keyword,
      activeTab: tab,
    })
    this.syncSortOptions(tab)
    this.syncFilterSections(tab)
    if (keyword) {
      this.bootstrapSearch()
    } else {
      wx.redirectTo({
        url: withStoreContextPath(
          `/pages/search/index/index?storeId=${encodeURIComponent(this.storeId)}`,
          { storeId: this.storeId, isolated: true }
        ),
      })
    }
  },

  async bootstrapSearch() {
    const ctx = await resolveCityContext()
    this.coords = ctx.coords
    this.setData({ locationGranted: ctx.locationGranted })
    this.runSearch()
  },

  syncSortOptions(tab) {
    const sortOptions =
      SORT_OPTIONS[tab] || SORT_OPTIONS[SEARCH_DEFAULT_TAB] || SORT_OPTIONS.service
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
        storeId: this.storeId,
      }
      if (this.coords) {
        query.coords = this.coords
      }

      const result = await searchContent(query)

      const merchants = (result.merchants || []).map((store) => ({
        ...store,
        cardTags: buildStoreCardTags(store, []),
      }))

      const services = result.services || []
      const cases = result.cases || []
      const counts = result.counts || {}
      const activeTab = this.data.activeTab
      const tabList = getTabList(activeTab, services, merchants, cases)
      const activeFilters = hasActiveFilters(this.data.filters)
      const pageEmpty = isPageEmpty(services, merchants, cases, counts)
      const showTabEmpty = !pageEmpty && !tabList.length
      const serviceNotices = resolveServiceComplianceNotices(services)

      this.setData({
        geoPages: [],
        services,
        merchants,
        cases,
        hotwords: [],
        counts,
        status: pageEmpty ? 'empty' : 'normal',
        showTabEmpty,
        tabEmptyHint: showTabEmpty ? buildTabEmptyHint(activeTab, counts) : '',
        showServicePriceNotice: serviceNotices.showServicePriceNotice,
        showServiceAccidentNotice: serviceNotices.showServiceAccidentNotice,
        emptyDescription: activeFilters
          ? '当前筛选条件下暂无结果，可尝试清空筛选'
          : '换个关键词试试，或返回查询页',
        emptyActionText: activeFilters ? '清空筛选' : '返回查询页',
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
    this.syncSortOptions(SEARCH_DEFAULT_TAB)
    this.syncFilterSections(SEARCH_DEFAULT_TAB)
    this.setData(
      {
        keyword,
        activeTab: SEARCH_DEFAULT_TAB,
        filters: createEmptyFilters(),
        hasActiveFilters: false,
      },
      () => this.runSearch()
    )
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
    if (this.storeId) {
      wx.redirectTo({
        url: withStoreContextPath(
          `/pages/search/index/index?storeId=${encodeURIComponent(this.storeId)}`,
          { storeId: this.storeId, isolated: true }
        ),
      })
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
    this.syncSortOptions(SEARCH_DEFAULT_TAB)
    this.syncFilterSections(SEARCH_DEFAULT_TAB)
    this.setData(
      {
        keyword,
        activeTab: SEARCH_DEFAULT_TAB,
        filters: createEmptyFilters(),
        hasActiveFilters: false,
      },
      () => this.runSearch()
    )
  },

  onServiceTap(e) {
    const serviceId = e.detail && e.detail.serviceId
    if (!serviceId || this._serviceNavigating) return
    this._serviceNavigating = true
    wx.navigateTo({
      url: withStoreContextPath(`/pages/service/detail/index?id=${serviceId}`, {
        storeId: this.storeId,
      }),
      complete: () => {
        this._serviceNavigating = false
      },
    })
  },

  onStoreTap(e) {
    const storeId = (e.detail && e.detail.storeId) || e.currentTarget.dataset.storeId
    if (!storeId || this._storeNavigating) return
    this._storeNavigating = true
    wx.navigateTo({
      url: withStoreContextPath(`/pages/store/detail/index?id=${storeId}`, {
        storeId: this.storeId || storeId,
      }),
      complete: () => {
        this._storeNavigating = false
      },
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
})

