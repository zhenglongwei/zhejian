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
const { fetchMerchantGeoOpportunity } = require('../../../services/merchant-geo')
const {
  fetchMerchantCasePublishPanel,
  fetchMerchantCaseArticleExport,
} = require('../../../services/merchant-public-case')
const { copyCaseH5Link, copyCaseListH5Link, openH5ContentSite } = require('../../../constants/h5-links')
const { fetchMerchantUnreadNotificationCount, fetchMerchantSubscribeStatus } = require('../../../services/notification')
const { formatCount } = require('../../../utils/merchant-dashboard')
const { isLoggedIn, isMerchantOwner } = require('../../../utils/auth')
const { requestMerchantNotificationSubscribe } = require('../../../utils/subscribe-message')
const {
  MERCHANT_WORKBENCH_GATE_NONE,
  MERCHANT_WORKBENCH_GATE_PENDING,
} = require('../../../constants/merchant-onboarding-copy')

function formatBadge(n) {
  const count = Number(n) || 0
  if (count <= 0) return ''
  return count > 99 ? '99+' : String(count)
}


function buildQuickActions() {
  return [
    {
      key: 'services',
      label: '服务方案',
      icon: '/assets/nav/settings.png',
      iconBg: 'primary-light',
    },
    {
      key: 'shareStore',
      label: '分享门店',
      icon: '/assets/nav/merchant.png',
      iconBg: 'warning-light',
    },
    {
      key: 'previewStore',
      label: '预览门店',
      icon: '/assets/tab/store.png',
      iconBg: 'info-light',
    },
    {
      key: 'dashboard',
      label: '数据概览',
      icon: '/assets/nav/album.png',
      iconBg: 'well',
    },
  ]
}

function buildTodoQueue(todos = {}) {
  const pendingLeads = Number(todos.pendingLeads) || 0
  const pendingAuth = Number(todos.pendingAuth) || 0
  const pendingUpload = Number(todos.pendingUpload) || 0
  const geoEvidenceBlocked = Number(todos.geoEvidenceBlocked) || 0
  return [
    {
      key: 'leads',
      count: pendingLeads,
      label: '条咨询待处理',
      actionLabel: '去处理',
      active: pendingLeads > 0,
    },
    {
      key: 'auth',
      count: pendingAuth,
      label: '本待公开授权',
      actionLabel: '去授权',
      active: pendingAuth > 0,
    },
    {
      key: 'upload',
      count: pendingUpload,
      label: '本待补节点',
      actionLabel: '去补传',
      active: pendingUpload > 0,
    },
    {
      key: 'geo',
      count: geoEvidenceBlocked,
      label: '个相册待补公开证据',
      actionLabel: '去补全',
      active: geoEvidenceBlocked > 0,
    },
  ]
}

function countTodoTotal(todos = {}) {
  return (
    (Number(todos.pendingLeads) || 0) +
    (Number(todos.pendingAuth) || 0) +
    (Number(todos.pendingUpload) || 0) +
    (Number(todos.geoEvidenceBlocked) || 0)
  )
}


Page({
  data: {
    status: 'loading',
    gateNone: MERCHANT_WORKBENCH_GATE_NONE,
    gatePending: MERCHANT_WORKBENCH_GATE_PENDING,
    profile: null,
    todos: {
      pendingLeads: 0,
      pendingUpload: 0,
      pendingAuth: 0,
      geoEvidenceBlocked: 0,
      activeAlbums: 0,
    },
    overview: {
      caseViews: '0',
      mpCaseViews: '0',
      leadSubmit: '0',
      transparency: '0',
    },
    casePublish: {
      pendingReview: 0,
      pendingPublish: 0,
      publishedH5: 0,
      readyToPublish: 0,
      caseViews7d: 0,
      h5CaseViews7d: 0,
      mpCaseViews7d: 0,
    },
    casePublishRecent: [],
    canManageStaff: false,
    storeOptions: [],
    storePickerIndex: 0,
    canSwitchStore: false,
    switchingStore: false,
    unreadMessages: 0,
    unreadBadgeText: '',
    needsSubscribePrompt: false,
    subscribeSheetVisible: false,
    quickActions: buildQuickActions(),
    todoQueue: buildTodoQueue(),
    todoTotal: 0,
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
      geoEvidenceBlocked: 0,
      activeAlbums: 0,
    }
    let overview = { caseViews: '0', leadSubmit: '0', transparency: '0' }
    let casePublish = {
      pendingReview: 0,
      pendingPublish: 0,
      publishedH5: 0,
      readyToPublish: 0,
      caseViews7d: 0,
      h5CaseViews7d: 0,
      mpCaseViews7d: 0,
    }
    let casePublishRecent = []
    let storeOptions = []
    let storePickerIndex = 0
    let canSwitchStore = false
    let unreadMessages = 0
    let needsSubscribePrompt = false
    let geoOpportunity = null
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
      const [stats, leadStats, dashStats, publishPanel, unreadCount, subscribeStatus, geoOpp] =
        await Promise.all([
        fetchMerchantAlbumStats(),
        fetchMerchantLeadStats(profile.storeId),
        fetchMerchantStats({ storeId: profile.storeId, period: '7d' }).catch(() => null),
        fetchMerchantCasePublishPanel({ storeId: profile.storeId }).catch(() => null),
        fetchMerchantUnreadNotificationCount().catch(() => 0),
        fetchMerchantSubscribeStatus('merchant').catch(() => ({ needsPrompt: false })),
        fetchMerchantGeoOpportunity({ storeId: profile.storeId }).catch(() => null),
      ])
      todos = {
        pendingLeads: leadStats.pending || 0,
        pendingUpload: stats.pendingUpload || 0,
        pendingAuth: stats.pendingAuth || 0,
        geoEvidenceBlocked: stats.geoEvidenceBlocked || 0,
        activeAlbums: stats.active || 0,
      }
      if (publishPanel && publishPanel.summary) {
        const summary = publishPanel.summary
        casePublish = {
          pendingReview: summary.pendingReview || summary.pendingPublish || 0,
          pendingPublish: summary.pendingReview || summary.pendingPublish || 0,
          publishedH5: summary.publishedH5 || 0,
          readyToPublish: summary.readyToPublish || 0,
          caseViews7d: summary.caseViews7d || 0,
          h5CaseViews7d: summary.h5CaseViews7d || 0,
          mpCaseViews7d: summary.mpCaseViews7d || 0,
        }
        casePublishRecent = publishPanel.recent || []
      }
      if (dashStats && dashStats.summary) {
        overview = {
          caseViews: formatCount(dashStats.summary.h5CaseViewCount ?? dashStats.summary.caseViewCount),
          mpCaseViews: formatCount(dashStats.summary.mpCaseViewCount),
          leadSubmit: formatCount(dashStats.summary.leadSubmitCount),
          transparency: formatCount(
            dashStats.transparency?.score ?? dashStats.summary.transparencyScore
          ),
        }
      }
      unreadMessages = unreadCount || 0
      needsSubscribePrompt = Boolean(subscribeStatus && subscribeStatus.needsPrompt)
      geoOpportunity = geoOpp || null
    } catch (e) {
      /* keep zeros */
    }
    const canManageStaff = isMerchantOwner()
    const todoQueue = buildTodoQueue(todos)
    this.setData({
      status: 'normal',
      profile,
      todos,
      todoQueue,
      todoTotal: countTodoTotal(todos),
      overview,
      casePublish,
      casePublishRecent,
      canManageStaff,
      storeOptions,
      storePickerIndex,
      canSwitchStore,
      unreadMessages,
      unreadBadgeText: formatBadge(unreadMessages),
      needsSubscribePrompt,
      geoOpportunity,
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

  onPrimaryActionTap(e) {
    const key = e.currentTarget.dataset.key
    this.onQuickActionTap({ currentTarget: { dataset: { key } } })
  },

  onQuickActionTap(e) {
    const key = e.currentTarget.dataset.key
    const handlers = {
      createAlbum: () => this.onCreateAlbum(),
      services: () => this.onServiceList(),
      shareStore: () => this.onShareStore(),
      previewStore: () => this.onPreviewStore(),
      dashboard: () => this.onDashboard(),
    }
    const fn = handlers[key]
    if (fn) fn()
  },

  onTodoRowTap(e) {
    const key = e.currentTarget.dataset.key
    const handlers = {
      leads: () => this.onLeadList({ currentTarget: { dataset: { tab: 'pending' } } }),
      auth: () => this.onAlbumList({ currentTarget: { dataset: { tab: 'pending_auth' } } }),
      upload: () => this.onAlbumList({ currentTarget: { dataset: { tab: 'all' } } }),
      geo: () => this.onAlbumList({ currentTarget: { dataset: { tab: 'all' } } }),
    }
    const fn = handlers[key]
    if (fn) fn()
  },

  onMoreMenuTap(e) {
    const key = e.currentTarget.dataset.key
    const handlers = {
      previewStore: () => this.onPreviewStore(),
      shareStore: () => this.onShareStore(),
      editStore: () => this.onEditStore(),
      staff: () => this.onStaffManage(),
    }
    const fn = handlers[key]
    if (fn) fn()
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

  onWechatNotifyTap() {
    if (this.data.needsSubscribePrompt) {
      this.setData({ subscribeSheetVisible: true })
      return
    }
    this.onWorkbenchSubscribe()
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
      this.setData({ needsSubscribePrompt })
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

  async _copyCaseWechatExport(caseId, field) {
    if (!caseId || this._wechatExportLoading) return
    this._wechatExportLoading = true
    wx.showLoading({ title: '生成中…', mask: true })
    try {
      const data = await fetchMerchantCaseArticleExport(caseId)
      const text = field === 'markdown' ? data.markdown : data.html
      if (!text) {
        wx.showToast({ title: '导出内容为空', icon: 'none' })
        return
      }
      await new Promise((resolve, reject) => {
        wx.setClipboardData({
          data: text,
          success: resolve,
          fail: reject,
        })
      })
      wx.showToast({
        title: field === 'markdown' ? 'Markdown 已复制' : 'HTML 已复制',
        icon: 'none',
        duration: 2500,
      })
    } catch (err) {
      wx.showToast({
        title: (err && err.message) || '导出失败',
        icon: 'none',
      })
    } finally {
      this._wechatExportLoading = false
      wx.hideLoading()
    }
  },

  onCasePublishSummaryTap(e) {
    const key = e.currentTarget.dataset.key
    if (key === 'pending') {
      this._navigateTo('/packageMerchant/pages/album/list/index?tab=pending_auth')
      return
    }
    if (key === 'published') {
      copyCaseListH5Link().catch(() => {
        openH5ContentSite()
      })
      return
    }
    if (key === 'views') {
      this.onDashboard()
    }
  },

  onCasePublishItemTap(e) {
    const index = e.currentTarget.dataset.index
    const item =
      (typeof index === 'number' && this.data.casePublishRecent[index]) ||
      this.data.casePublishRecent.find(
        (row) =>
          row.caseId === e.currentTarget.dataset.caseId ||
          row.albumId === e.currentTarget.dataset.albumId
      )
    if (!item) return

    const publishedKeys = ['published_h5', 'published_wechat']
    if (publishedKeys.includes(item.publishStatus) || item.h5Url) {
      wx.showActionSheet({
        itemList: ['复制 H5 链接', '复制公众号 HTML', '复制公众号 Markdown'],
        success: (res) => {
          if (res.tapIndex === 0) {
            copyCaseH5Link(item).catch(() => {
              wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' })
            })
            return
          }
          this._copyCaseWechatExport(item.caseId, res.tapIndex === 1 ? 'html' : 'markdown')
        },
      })
      return
    }
    if (item.albumId) {
      this._navigateTo(`/packageMerchant/pages/album/edit/index?albumId=${item.albumId}`)
      return
    }
    if (item.caseId) {
      this._navigateTo(`/packageMerchant/pages/album/list/index?tab=pending_auth`)
    }
  },
})
