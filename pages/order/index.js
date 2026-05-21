const { fetchUserOrders } = require('../../services/order')
const { ORDER_LIST_TABS } = require('../../constants/order-list-tabs')
const { enrichListItem } = require('../../utils/order-display')
const { handleOrderAction, navigateToOrderDetail } = require('../../utils/order-actions')
const { isLoggedIn } = require('../../utils/auth')

const app = getApp()

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    needLogin: false,
    tabs: ORDER_LIST_TABS,
    activeTab: 'all',
    list: [],
    loginSheetVisible: false,
    loginSheetMode: 'auto',
  },

  onLoad() {
    this.applyPendingTab()
  },

  onShow() {
    this.applyPendingTab()
    this.loadList()
  },

  applyPendingTab() {
    const pending = app.globalData.pendingOrderTab
    if (pending) {
      app.globalData.pendingOrderTab = ''
      this.setData({ activeTab: pending })
    }
  },

  onPullDownRefresh() {
    this.loadList().finally(() => wx.stopPullDownRefresh())
  },

  async loadList() {
    if (!isLoggedIn()) {
      this.setData({
        status: 'unauthenticated',
        needLogin: true,
        list: [],
        errorMessage: '',
      })
      return
    }

    this.setData({ status: 'loading', errorMessage: '', needLogin: false })
    try {
      const raw = await fetchUserOrders({ tab: this.data.activeTab })
      const list = (raw || []).map(enrichListItem)
      this.setData({
        list,
        status: list.length ? 'normal' : 'empty',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
        list: [],
      })
    }
  },

  onTabChange(e) {
    const { key } = e.detail
    if (key === this.data.activeTab) return
    this.setData({ activeTab: key })
    this.loadList()
  },

  onRetry() {
    this.loadList()
  },

  onLoginTap() {
    this.setData({ loginSheetVisible: true, loginSheetMode: 'login' })
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
  },

  onLoginSheetSuccess() {
    this.closeLoginSheet()
    this.loadList()
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/home/index' })
  },

  onCardTap(e) {
    const { id } = e.detail || {}
    if (id) navigateToOrderDetail(id)
  },

  onPrimaryAction(e) {
    const { id, action } = e.detail || {}
    const order = this.data.list.find((o) => o.id === id)
    if (!order) return
    handleOrderAction(action || order.primaryAction.actionKey, {
      order,
      onRefresh: () => this.loadList(),
    })
  },
})
