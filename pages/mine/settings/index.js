const { isLoggedIn, clearSession } = require('../../../utils/auth')
const { clearSearchHistory } = require('../../../utils/search-history')
const { fetchUserSubscribeStatus } = require('../../../services/notification')
const { requestUserNotificationSubscribe } = require('../../../utils/subscribe-message')
const { HOME_PLATFORM_IDENTITY } = require('../../../constants/home-entries')

const SUBSCRIBE_HINT =
  '微信一次性订阅消息，不是 App 常驻推送。每次点击授权仅增加 1 条发送额度；额度用完后请再次授权。提交授权公示时也会引导开启。'

Page({
  data: {
    isLoggedIn: false,
    platformNotice: HOME_PLATFORM_IDENTITY,
    subscribeStatusText: '未开启',
    subscribeHint: SUBSCRIBE_HINT,
  },

  onShow() {
    this.syncLoginState()
    this.loadSubscribeStatus()
  },

  syncLoginState() {
    this.setData({ isLoggedIn: isLoggedIn() })
  },

  async loadSubscribeStatus() {
    if (!isLoggedIn()) {
      this.setData({ subscribeStatusText: '未开启' })
      return
    }
    try {
      const status = await fetchUserSubscribeStatus('default')
      const needsPrompt = Boolean(status && status.needsPrompt)
      this.setData({
        subscribeStatusText: needsPrompt ? '未开启' : '可接收',
      })
    } catch (e) {
      this.setData({ subscribeStatusText: '未开启' })
    }
  },

  onSubscribeCellTap() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    requestUserNotificationSubscribe('default').finally(() => {
      this.loadSubscribeStatus()
    })
  },

  onCellTap(e) {
    const { key } = e.currentTarget.dataset
    if (key === 'help') {
      wx.navigateTo({ url: '/pages/mine/help/index' })
      return
    }
    if (key === 'cache') {
      this.onClearCache()
      return
    }
    if (key === 'agreement') {
      wx.navigateTo({ url: '/pages/mine/settings/document/index?type=agreement' })
      return
    }
    if (key === 'privacy') {
      wx.navigateTo({ url: '/pages/mine/settings/document/index?type=privacy' })
      return
    }
    if (key === 'about') {
      wx.showModal({
        title: '关于辙见',
        content: HOME_PLATFORM_IDENTITY,
        showCancel: false,
      })
      return
    }
    if (key === 'deactivate') {
      wx.navigateTo({ url: '/pages/mine/settings/deactivate/index' })
    }
  },

  onClearCache() {
    try {
      clearSearchHistory()
      wx.removeStorageSync('city_outside_notice_v1')
    } catch (e) {
      // ignore
    }
    wx.showToast({ title: '已清除本地缓存', icon: 'success' })
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后将无法查看服务相册与授权状态，确定退出吗？',
      success: (res) => {
        if (!res.confirm) return
        clearSession()
        this.syncLoginState()
        wx.showToast({ title: '已退出登录', icon: 'success' })
        setTimeout(() => {
          const { reLaunchAppHome } = require('../../../utils/app-home')
          reLaunchAppHome()
        }, 400)
      },
    })
  },
})
