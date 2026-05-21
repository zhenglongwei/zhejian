const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../services/merchant')
const { fetchMerchantOrderStats } = require('../../../services/merchant-order')

Page({
  data: {
    status: 'loading',
    profile: null,
    todos: {
      waitAccept: 0,
      today: 0,
      inService: 0,
      waitComplete: 0,
    },
  },

  onShow() {
    this.loadProfile()
  },

  async loadProfile() {
    this.setData({ status: 'loading' })
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
      this.setData({ status: 'none', profile: null })
      return
    }
    let todos = {
      waitAccept: 0,
      today: 0,
      inService: 0,
      waitComplete: 0,
    }
    try {
      todos = await fetchMerchantOrderStats()
    } catch (e) {
      /* keep zeros */
    }
    this.setData({ status: 'normal', profile, todos })
  },

  onGoOnboarding() {
    wx.navigateTo({ url: '/packageMerchant/pages/onboarding/index' })
  },

  onCreateAlbum() {
    wx.navigateTo({ url: '/packageMerchant/pages/album/create/index' })
  },

  onAlbumList() {
    wx.navigateTo({ url: '/packageMerchant/pages/album/list/index' })
  },

  onServiceList() {
    wx.navigateTo({ url: '/packageMerchant/pages/service/list/index' })
  },

  onOrderList(e) {
    const tab =
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) ||
      'all'
    wx.navigateTo({
      url: `/packageMerchant/pages/order/list/index?tab=${tab}`,
    })
  },
})
