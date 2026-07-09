const {
  fetchMerchantNotifications,
  markMerchantNotificationsRead,
} = require('../../../services/notification')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../services/merchant')
const { isLoggedIn } = require('../../../utils/auth')
const { promptMerchantWorkbenchSubscribe } = require('../../../utils/subscribe-message-prompt')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    list: [],
    unreadCount: 0,
    isLoggedIn: false,
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
        isLoggedIn: false,
        list: [],
        unreadCount: 0,
        errorMessage: '',
      })
      return
    }

    this.setData({
      status: 'loading',
      errorMessage: '',
      isLoggedIn: true,
      list: [],
    })

    try {
      const profile = await fetchMerchantProfile()
      if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
        this.setData({
          status: 'error',
          errorMessage: '请先完成商家入驻并通过审核',
          list: [],
          unreadCount: 0,
        })
        return
      }

      const data = await fetchMerchantNotifications({ page: 1, pageSize: 50 })
      const list = (data && data.list) || []
      this.setData({
        list,
        unreadCount: Number(data && data.unreadCount) || 0,
        status: list.length ? 'normal' : 'empty',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
        list: [],
        unreadCount: 0,
      })
    }
  },

  onRetry() {
    this.loadList()
  },

  onGoLogin() {
    const { reLaunchAppHome } = require('../../../utils/app-home')
    reLaunchAppHome()
  },

  async onItemTap(e) {
    const { id, path } = e.detail || {}
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

  onSubscribeWechat() {
    if (!isLoggedIn()) {
      this.onGoLogin()
      return
    }
    promptMerchantWorkbenchSubscribe()
  },
})
