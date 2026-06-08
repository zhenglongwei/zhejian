const {
  fetchMerchantNotifications,
  markMerchantNotificationsRead,
} = require('../../../services/notification')
const { isLoggedIn } = require('../../../utils/auth')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    needLogin: false,
    list: [],
    unreadCount: 0,
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
      const data = await fetchMerchantNotifications({ page: 1, pageSize: 50 })
      const list = data?.list || []
      this.setData({
        list,
        unreadCount: Number(data?.unreadCount) || 0,
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

  onRetry() {
    this.loadList()
  },

  onGoLogin() {
    wx.switchTab({ url: '/pages/mine/index' })
  },

  async onItemTap(e) {
    const { id, path } = e.currentTarget.dataset
    if (!id) return
    try {
      await markMerchantNotificationsRead([id])
    } catch (err) {
      // ignore
    }
    if (path) {
      wx.navigateTo({
        url: path.startsWith('/') ? path : `/${path}`,
        fail() {
          wx.showToast({ title: '页面暂不可用', icon: 'none' })
        },
      })
    }
    this.loadList()
  },

  async onMarkAllRead() {
    try {
      await markMerchantNotificationsRead([])
      wx.showToast({ title: '已全部标为已读', icon: 'success' })
      this.loadList()
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    }
  },
})
