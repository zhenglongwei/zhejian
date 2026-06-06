const {
  fetchMerchantProfile,
  refreshMerchantSession,
  MERCHANT_STATUS,
} = require('../../../services/merchant')
const { fetchMerchantAlbumStats } = require('../../../services/merchant-service-album')
const { fetchMerchantLeadStats } = require('../../../services/merchant-lead')
const { fetchMerchantStats } = require('../../../services/merchant-stats')
const { formatCount } = require('../../../utils/merchant-dashboard')
const { isLoggedIn, isMerchantOwner } = require('../../../utils/auth')

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
    overview: {
      caseViews: '0',
      leadSubmit: '0',
      transparency: '0',
    },
    canManageStaff: false,
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
    let overview = { caseViews: '0', leadSubmit: '0', transparency: '0' }
    try {
      const [stats, leadStats, dashStats] = await Promise.all([
        fetchMerchantAlbumStats(),
        fetchMerchantLeadStats(profile.storeId),
        fetchMerchantStats({ storeId: profile.storeId, period: '7d' }).catch(() => null),
      ])
      todos = {
        pendingLeads: leadStats.pending || 0,
        pendingUpload: stats.pendingUpload || 0,
        pendingAuth: stats.pendingAuth || 0,
        activeAlbums: stats.active || 0,
      }
      if (dashStats && dashStats.summary) {
        overview = {
          caseViews: formatCount(dashStats.summary.caseViewCount),
          leadSubmit: formatCount(dashStats.summary.leadSubmitCount),
          transparency: formatCount(
            dashStats.transparency?.score ?? dashStats.summary.transparencyScore
          ),
        }
      }
    } catch (e) {
      /* keep zeros */
    }
    this.setData({
      status: 'normal',
      profile,
      todos,
      overview,
      canManageStaff: isMerchantOwner(),
    })
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

  onScanCreateAlbum() {
    this._navigateTo('/packageMerchant/pages/album/create/index?mode=scan')
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

  onStaffManage() {
    this._navigateTo('/packageMerchant/pages/staff/list/index')
  },

  onDashboard() {
    this._navigateTo('/packageMerchant/pages/dashboard/index')
  },

  onPreviewStore() {
    const { profile } = this.data
    if (!profile || !profile.storeId) {
      wx.showToast({ title: '未找到门店信息', icon: 'none' })
      return
    }
    this._navigateTo(
      `/pages/store/detail/index?id=${profile.storeId}&preview=1`
    )
  },

  onEditStore() {
    this._navigateTo('/packageMerchant/pages/store/edit/index')
  },

  onShareStore() {
    const { profile } = this.data
    if (!profile || !profile.storeId) {
      wx.showToast({ title: '未找到门店信息', icon: 'none' })
      return
    }
    this._navigateTo(
      `/pages/store/detail/index?id=${profile.storeId}&preview=1&share=1`
    )
  },
})
