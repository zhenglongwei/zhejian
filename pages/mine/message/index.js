const {
  fetchUserNotifications,
  markUserNotificationsRead,
} = require('../../../services/notification')
const { isLoggedIn } = require('../../../utils/auth')
const { requestUserNotificationSubscribe } = require('../../../utils/subscribe-message')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    needLogin: false,
    list: [],
    unreadCount: 0,
    isLoggedIn: false,
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
        isLoggedIn: false,
        list: [],
        errorMessage: '',
      })
      return
    }

    this.setData({ status: 'loading', errorMessage: '', needLogin: false, isLoggedIn: true })
    try {
      const data = await fetchUserNotifications({ page: 1, pageSize: 50 })
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

  async onItemTap(e) {
    const { id, path } = e.currentTarget.dataset
    if (!id) return
    try {
      await markUserNotificationsRead([id])
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
      await markUserNotificationsRead([])
      wx.showToast({ title: '已全部标为已读', icon: 'success' })
      this.loadList()
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    }
  },

  onSubscribeWechat() {
    if (!isLoggedIn()) {
      this.onLoginTap()
      return
    }
    requestUserNotificationSubscribe('default')
  },
})
