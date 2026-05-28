const { fetchServiceList } = require('../../services/service')
const { SERVICE_CATEGORIES } = require('../../constants/service')
const { SEARCH_PLACEHOLDER } = require('../../constants/search')

const FILTER_ALL = 'all'

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
  },

  onLoad() {
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
    const { serviceId } = e.detail
    wx.navigateTo({
      url: `/pages/service/detail/index?id=${serviceId}`,
    })
  },

  onSearchNavigate() {
    wx.navigateTo({ url: '/pages/search/index/index' })
  },
})
