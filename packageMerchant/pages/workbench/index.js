const {
  fetchMerchantProfile,
  refreshMerchantSession,
  fetchMerchantStores,
  switchMerchantStore,
  MERCHANT_STATUS,
} = require('../../../services/merchant')
const { fetchMerchantAlbumStats } = require('../../../services/merchant-service-album')
const { fetchMerchantLeadStats } = require('../../../services/merchant-lead')
const { fetchMerchantStats } = require('../../../services/merchant-stats')
const { fetchMerchantUnreadNotificationCount, fetchMerchantSubscribeStatus } = require('../../../services/notification')
const { formatCount } = require('../../../utils/merchant-dashboard')
const { isLoggedIn, isMerchantOwner } = require('../../../utils/auth')
const { requestMerchantNotificationSubscribe } = require('../../../utils/subscribe-message')

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
    storeOptions: [],
    storePickerIndex: 0,
    canSwitchStore: false,
    switchingStore: false,
    unreadMessages: 0,
    messageButtonLabel: '消息通知',
    needsSubscribePrompt: false,
    subscribeSheetVisible: false,
    subscribeBannerDescription:
      '有新咨询线索或审核结果时，可在微信及时提醒你。每次授权可收 1 条，站内消息不受影响。',
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
    let storeOptions = []
    let storePickerIndex = 0
    let canSwitchStore = false
    let unreadMessages = 0
    let needsSubscribePrompt = false
    try {
      if (isMerchantOwner()) {
        const storeData = await fetchMerchantStores()
        storeOptions = storeData.list || []
        storePickerIndex = Math.max(
          0,
          storeOptions.findIndex((item) => item.id === profile.storeId)
        )
        canSwitchStore = storeOptions.length > 1
      }
    } catch (e) {
      storeOptions = []
    }
    try {
      const [stats, leadStats, dashStats, unreadCount, subscribeStatus] = await Promise.all([
        fetchMerchantAlbumStats(),
        fetchMerchantLeadStats(profile.storeId),
        fetchMerchantStats({ storeId: profile.storeId, period: '7d' }).catch(() => null),
        fetchMerchantUnreadNotificationCount().catch(() => 0),
        fetchMerchantSubscribeStatus('merchant').catch(() => ({ needsPrompt: false })),
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
      unreadMessages = unreadCount || 0
      needsSubscribePrompt = Boolean(subscribeStatus && subscribeStatus.needsPrompt)
    } catch (e) {
      /* keep zeros */
    }
    this.setData({
      status: 'normal',
      profile,
      todos,
      overview,
      canManageStaff: isMerchantOwner(),
      storeOptions,
      storePickerIndex,
      canSwitchStore,
      unreadMessages,
      needsSubscribePrompt,
      subscribeSheetVisible: needsSubscribePrompt,
      messageButtonLabel:
        unreadMessages > 0 ? `消息通知 (${unreadMessages})` : '消息通知',
    })
  },

  onStoreChange(e) {
    const index = Number(e.detail.value)
    const { storeOptions, profile, canSwitchStore, switchingStore } = this.data
    if (!canSwitchStore || switchingStore || !Number.isFinite(index)) return
    const picked = storeOptions[index]
    if (!picked || picked.id === profile.storeId) return
    this.doSwitchStore(picked.id, index)
  },

  async doSwitchStore(storeId, pickerIndex) {
    if (this.data.switchingStore) return
    this.setData({ switchingStore: true })
    try {
      wx.showLoading({ title: '切换门店', mask: true })
      await switchMerchantStore(storeId)
      wx.hideLoading()
      this.setData({ storePickerIndex: pickerIndex })
      await this.loadProfile()
      wx.showToast({ title: '已切换门店', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      this.setData({
        storePickerIndex: Math.max(
          0,
          this.data.storeOptions.findIndex((item) => item.id === this.data.profile?.storeId)
        ),
      })
      wx.showToast({ title: (e && e.message) || '切换失败', icon: 'none' })
    } finally {
      this.setData({ switchingStore: false })
    }
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

  onStaffManage() {
    this._navigateTo('/packageMerchant/pages/staff/list/index')
  },

  onDashboard() {
    this._navigateTo('/packageMerchant/pages/dashboard/index')
  },

  onMessageList() {
    this._navigateTo('/packageMerchant/pages/message/index')
  },

  onSubscribeSheetClose() {
    this.setData({ subscribeSheetVisible: false })
  },

  async onSubscribeSheetConfirm() {
    await this.onWorkbenchSubscribe()
    this.setData({ subscribeSheetVisible: false })
  },

  async refreshSubscribePrompt() {
    try {
      const subscribeStatus = await fetchMerchantSubscribeStatus('merchant')
      const needsSubscribePrompt = Boolean(subscribeStatus && subscribeStatus.needsPrompt)
      this.setData({
        needsSubscribePrompt,
        subscribeSheetVisible: needsSubscribePrompt ? this.data.subscribeSheetVisible : false,
      })
    } catch (e) {
      // ignore
    }
  },

  async onWorkbenchSubscribe() {
    await requestMerchantNotificationSubscribe('merchant')
    await this.refreshSubscribePrompt()
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
