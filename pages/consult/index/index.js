const { fetchUserLeads } = require('../../../services/lead')
const { LEAD_LIST_TABS } = require('../../../constants/lead-list-tabs')
const { enrichLeadListItem } = require('../../../utils/lead-display')
const { isLoggedIn } = require('../../../utils/auth')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    needLogin: false,
    tabs: LEAD_LIST_TABS,
    activeTab: 'all',
    list: [],
    loginSheetVisible: false,
    loginSheetMode: 'auto',
  },

  onShow() {
    this.loadList()
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
      const raw = await fetchUserLeads({ tab: this.data.activeTab })
      const list = (raw || []).map(enrichLeadListItem)
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

  onGoService() {
    wx.switchTab({ url: '/pages/service/index' })
  },

  onCardTap(e) {
    const { id } = e.detail || {}
    if (!id) return
    wx.navigateTo({ url: `/pages/consult/detail/index?id=${id}` })
  },
})
