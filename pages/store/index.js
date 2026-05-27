const { fetchStoreList } = require('../../services/store')
const { buildStoreCardTags } = require('../../utils/store-tags')
const { SEARCH_PLACEHOLDER } = require('../../constants/search')

Page({
  data: {
    status: 'loading',
    list: [],
    errorMessage: '',
    searchPlaceholder: SEARCH_PLACEHOLDER,
  },

  onLoad() {
    this.loadList()
  },

  onPullDownRefresh() {
    this.loadList().finally(() => wx.stopPullDownRefresh())
  },

  async loadList() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const { list } = await fetchStoreList()
      const enriched = list.map((store) => ({
        ...store,
        cardTags: buildStoreCardTags(store, []),
      }))
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

  onStoreTap(e) {
    const storeId = (e.detail && e.detail.storeId) || e.currentTarget.dataset.storeId
    if (!storeId) return
    wx.navigateTo({
      url: `/pages/store/detail/index?id=${storeId}`,
    })
  },

  onSearchNavigate() {
    wx.navigateTo({ url: '/pages/search/index/index' })
  },
})
