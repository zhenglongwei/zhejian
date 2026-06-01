const {
  fetchMerchantProfile,
  refreshMerchantSession,
  MERCHANT_STATUS,
} = require('../../../services/merchant')
const { fetchMerchantAlbumStats } = require('../../../services/merchant-service-album')
const { fetchMerchantLeadStats } = require('../../../services/merchant-lead')
const { isLoggedIn } = require('../../../utils/auth')

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
    if (isLoggedIn()) {
      try {
        await refreshMerchantSession()
      } catch (e) {
        /* 忽略刷新失败 */
      }
    }
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status === MERCHANT_STATUS.NONE) {
      this.setData({ status: 'none', profile: null })
      return
    }
    if (profile.status === MERCHANT_STATUS.PENDING) {
      this.setData({ status: 'pending', profile })
      return
    }
    if (profile.status === MERCHANT_STATUS.REJECTED || profile.status === MERCHANT_STATUS.NEED_MODIFY) {
      this.setData({ status: profile.status === MERCHANT_STATUS.NEED_MODIFY ? 'need_modify' : 'rejected', profile })
      return
    }
    if (profile.status !== MERCHANT_STATUS.APPROVED) {
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

  onRefreshAudit() {
    wx.navigateTo({ url: '/packageMerchant/pages/onboarding/index' })
  },

  _navigateTo(url) {
    if (this._navigating) return
    this._navigating = true
    wx.navigateTo({
      url,
      complete: () => {
        setTimeout(() => {
          this._navigating = false
        }, 400)
      },
    })
  },

  onCreateAlbum() {
    this._navigateTo('/packageMerchant/pages/album/create/index')
  },

  onAlbumList(e) {
    const tab =
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) ||
      'all'
    this._navigateTo(`/packageMerchant/pages/album/list/index?tab=${tab}`)
  },

  onServiceList() {
    this._navigateTo('/packageMerchant/pages/service/list/index')
  },

  onLeadList(e) {
    const tab =
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) ||
      'pending'
    this._navigateTo(`/packageMerchant/pages/lead/list/index?tab=${tab}`)
  },
})
