const { fetchMineSummary } = require('../../services/user')
const { isLoggedIn, checkAuth, syncAppSession } = require('../../utils/auth')
const {
  MINE_ORDER_SHORTCUTS,
  MINE_PROTECTED_MENUS,
  MINE_PUBLIC_MENUS,
} = require('../../constants/mine-menu')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    isLoggedIn: false,
    user: null,
    orderShortcuts: [],
    protectedMenus: MINE_PROTECTED_MENUS,
    publicMenus: MINE_PUBLIC_MENUS,
    assets: null,
    vehicleCount: 0,
    repairArchiveCount: 0,
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    loginSheetBindContext: 'general',
  },

  onLoad() {
    syncAppSession()
    this.initOrderShortcuts()
  },

  onShow() {
    this.loadPage()
  },

  onPullDownRefresh() {
    this.loadPage().finally(() => wx.stopPullDownRefresh())
  },

  initOrderShortcuts() {
    this.setData({
      orderShortcuts: MINE_ORDER_SHORTCUTS.map((item) => ({
        ...item,
        count: 0,
      })),
    })
  },

  buildOrderShortcuts(counts) {
    const source = counts || {}
    return MINE_ORDER_SHORTCUTS.map((item) => {
      const count =
        item.key === 'all'
          ? Object.values(source).reduce((sum, n) => sum + (Number(n) || 0), 0)
          : Number(source[item.key]) || 0
      return { ...item, count: count > 99 ? '99+' : count > 0 ? String(count) : '' }
    })
  },

  async loadPage() {
    const loggedIn = isLoggedIn()
    if (!loggedIn) {
      this.setData({
        status: 'normal',
        isLoggedIn: false,
        user: null,
        assets: null,
        vehicleCount: 0,
        repairArchiveCount: 0,
        orderShortcuts: this.buildOrderShortcuts({}),
        errorMessage: '',
      })
      return
    }

    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const summary = await fetchMineSummary()
      if (!summary) {
        this.setData({
          status: 'normal',
          isLoggedIn: false,
          user: null,
        })
        return
      }
      this.setData({
        status: 'normal',
        isLoggedIn: true,
        user: summary.user,
        assets: summary.assets,
        vehicleCount: summary.vehicleCount || 0,
        repairArchiveCount: summary.repairArchiveCount || 0,
        orderShortcuts: this.buildOrderShortcuts(summary.orderCounts),
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '数据加载失败，请下拉刷新或稍后重试。',
      })
    }
  },

  onRetry() {
    this.loadPage()
  },

  openLoginSheet(mode = 'auto', bindContext = 'general') {
    this.setData({
      loginSheetVisible: true,
      loginSheetMode: mode,
      loginSheetBindContext: bindContext,
    })
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
  },

  onLoginSheetSuccess() {
    this.closeLoginSheet()
    this.loadPage()
  },

  onUserAreaTap() {
    if (this.data.isLoggedIn) {
      if (!(this.data.user && this.data.user.isPhoneBound)) {
        this.openLoginSheet('bindPhone')
      }
      return
    }
    this.openLoginSheet('login')
  },

  onLoginTap() {
    this.openLoginSheet('login')
  },

  onBindPhoneTap() {
    this.openLoginSheet('bindPhone')
  },

  guardProtectedEntry(needPhone = false) {
    const auth = checkAuth({ needPhone })
    if (!auth.ok) {
      this.openLoginSheet(auth.reason === 'bindPhone' ? 'bindPhone' : 'login')
      return false
    }
    return true
  },

  onOrderShortcutTap(e) {
    if (!this.guardProtectedEntry(false)) return
    const { key } = e.currentTarget.dataset
    const app = getApp()
    app.globalData.pendingOrderTab = key || 'all'
    wx.switchTab({ url: '/pages/order/index' })
  },

  onProtectedMenuTap(e) {
    const { key } = e.currentTarget.dataset
    if (!this.guardProtectedEntry(false)) return
    if (key === 'reviews') {
      wx.navigateTo({ url: '/pages/review/list/index' })
      return
    }
    if (key === 'rewards') {
      wx.navigateTo({ url: '/pages/reward/records/index' })
      return
    }
    const labels = {
      vehicles: '我的车辆',
      archive: '维修档案',
      coupons: '优惠券',
      settings: '设置',
    }
    wx.showToast({
      title: `${labels[key] || '功能'}将在后续版本开放`,
      icon: 'none',
    })
  },

  onPublicMenuTap(e) {
    const { key } = e.currentTarget.dataset
    if (key === 'support') {
      wx.showToast({ title: '客服功能将在后续版本开放', icon: 'none' })
      return
    }
    if (key === 'rules') {
      wx.showModal({
        title: '平台规则',
        content: '透明维修平台致力于提供可验证的维修过程与诚实价格信息。详细规则页将在后续版本开放。',
        showCancel: false,
      })
      return
    }
    if (key === 'about') {
      wx.showModal({
        title: '关于平台',
        content: '透明维修服务平台（浙检）— 像一份可翻阅的维修档案，而不是促销传单。',
        showCancel: false,
      })
    }
  },

  onOpenMerchant() {
    wx.navigateTo({ url: '/packageMerchant/pages/workbench/index' })
  },
})
