const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../services/merchant')
const { fetchMerchantAlbumStats } = require('../../../services/merchant-service-album')
const { fetchMerchantLeadStats } = require('../../../services/merchant-lead')

Page({
  data: {
    status: 'loading',
    profile: null,
    todos: {
      pendingLeads: 0,
      pendingUpload: 0,
      pendingAuth: 0,
      activeAlbums: 0,
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
      pendingLeads: 0,
      pendingUpload: 0,
      pendingAuth: 0,
      activeAlbums: 0,
    }
    try {
      const [stats, leadStats] = await Promise.all([
        fetchMerchantAlbumStats(),
        fetchMerchantLeadStats(profile.storeId),
      ])
      todos = {
        pendingLeads: leadStats.pending || 0,
        pendingUpload: stats.pendingUpload || 0,
        pendingAuth: stats.pendingAuth || 0,
        activeAlbums: stats.active || 0,
      }
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

  onAlbumList(e) {
    const tab =
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) ||
      'all'
    wx.navigateTo({
      url: `/packageMerchant/pages/album/list/index?tab=${tab}`,
    })
  },

  onServiceList() {
    wx.navigateTo({ url: '/packageMerchant/pages/service/list/index' })
  },

  onLeadList(e) {
    const tab =
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) ||
      'pending'
    wx.navigateTo({
      url: `/packageMerchant/pages/lead/list/index?tab=${tab}`,
    })
  },
})
