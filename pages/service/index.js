const { fetchServiceList } = require('../../services/service')
const { SERVICE_CATEGORIES } = require('../../constants/service')
const { SEARCH_PLACEHOLDER } = require('../../constants/search')
const { resolvePageShareContext, withStoreContextPath } = require('../../utils/share-store-context')

const FILTER_ALL = 'all'

const INTRO_DESC_DEFAULT = '价格模式清晰标注，可提交咨询或预约到店'
const INTRO_DESC_STORE = '本店可展示服务方案，价格模式清晰标注，可留言咨询'

const CATEGORY_TABS = [
  { key: FILTER_ALL, label: '全部' },
  ...SERVICE_CATEGORIES.map((c) => ({ key: c.id, label: c.name })),
]

Page({
  data: {
    status: 'loading',
    list: [],
    categoryTabs: CATEGORY_TABS,
    filterCategory: FILTER_ALL,
    errorMessage: '',
    searchPlaceholder: SEARCH_PLACEHOLDER,
    storeIsolated: false,
    storeId: '',
    introTitle: '可展示服务',
    introDesc: INTRO_DESC_DEFAULT,
    emptyTitle: '暂无可预约服务',
    emptyDescription: '商家上架服务方案后将展示在此',
  },

  onLoad(options) {
    const shareCtx = resolvePageShareContext(options, {
      storeId: options.storeId || '',
      source: 'service_list',
      autoIsolate: Boolean(options.storeId),
    })
    this.storeId = shareCtx.storeId || options.storeId || ''
    const storeIsolated = Boolean(this.storeId)
    this.setData({
      storeIsolated: shareCtx.isolated,
      storeId: this.storeId,
      introTitle: storeIsolated ? '本店服务方案' : '可展示服务',
      introDesc: storeIsolated ? INTRO_DESC_STORE : INTRO_DESC_DEFAULT,
      emptyTitle: storeIsolated ? '本店暂无可展示服务' : '暂无可预约服务',
      emptyDescription: storeIsolated
        ? '该门店上架服务方案后将展示在此'
        : '商家上架服务方案后将展示在此',
    })
    this.loadList()
  },

  onShow() {
    const app = getApp()
    const pending = app.globalData.pendingServiceCategory
    if (pending && pending !== this.data.filterCategory) {
      app.globalData.pendingServiceCategory = ''
      this.setData({ filterCategory: pending }, () => this.loadList())
    }
  },

  onPullDownRefresh() {
    this.loadList().finally(() => wx.stopPullDownRefresh())
  },

  async loadList() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const query = {}
      if (this.data.filterCategory !== FILTER_ALL) {
        query.categoryId = this.data.filterCategory
      }
      if (this.storeId) {
        query.storeId = this.storeId
      }
      const { list } = await fetchServiceList(query)
      this.setData({
        list,
        status: list.length ? 'normal' : 'empty',
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
    this.setData({ filterCategory: key }, () => this.loadList())
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

  onSearchNavigate() {
    if (this.data.storeIsolated) return
    wx.navigateTo({ url: '/pages/search/index/index' })
  },
})
