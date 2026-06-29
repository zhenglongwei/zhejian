const {
  fetchMerchantAlbumReviews,
} = require('../../../../services/merchant-album-review')
const { MERCHANT_REVIEW_LIST_TABS } = require('../../../../constants/album-review')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')

function normalizeReviewList(raw) {
  if (Array.isArray(raw)) return raw
  if (raw && Array.isArray(raw.list)) return raw.list
  return []
}

Page({
  data: {
    status: 'loading',
    list: [],
    tabs: MERCHANT_REVIEW_LIST_TABS,
    activeTab: 'pending',
    errorMessage: '',
    storeId: '',
    emptyTitle: '暂无评价',
    emptyDescription: '车主在相册完工后可提交服务评价',
    skeletonItems: [0, 1, 2],
  },

  onLoad(options) {
    const activeTab = options.tab || 'pending'
    this.setData({ activeTab })
  },

  onShow() {
    this.ensureMerchant()
  },

  onPullDownRefresh() {
    this.loadList().finally(() => wx.stopPullDownRefresh())
  },

  async ensureMerchant() {
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
      wx.showModal({
        title: '请先入驻',
        content: '完成商家入驻后可查看车主评价',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/packageMerchant/pages/onboarding/index' })
          } else {
            wx.navigateBack()
          }
        },
      })
      return
    }
    this.storeId = profile.storeId || ''
    this.setData({ storeId: this.storeId })
    this.loadList()
  },

  async loadList() {
    if (!this.storeId) return
    this.setData({ status: 'loading', errorMessage: '', list: [] })
    try {
      const raw = await fetchMerchantAlbumReviews({
        storeId: this.storeId,
        tab: this.data.activeTab,
      })
      const list = normalizeReviewList(raw)
      this.setData({
        list,
        status: list.length ? 'normal' : 'empty',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onTabChange(e) {
    const activeTab = (e.detail && e.detail.key) || 'pending'
    if (activeTab === this.data.activeTab) return
    this.setData({ activeTab })
    this.loadList()
  },

  onRetry() {
    this.loadList()
  },

  onOpenDetail(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    wx.navigateTo({
      url: `/packageMerchant/pages/review/detail/index?id=${encodeURIComponent(id)}`,
    })
  },
})
