const { isLoggedIn, clearSession, maskPhone, getSession } = require('../../../utils/auth')
const { clearSearchHistory } = require('../../../utils/search-history')
const { fetchUserSubscribeStatus } = require('../../../services/notification')
const { requestUserNotificationSubscribe } = require('../../../utils/subscribe-message')
const { HOME_PLATFORM_IDENTITY } = require('../../../constants/home-entries')

const SUBSCRIBE_DESC_DEFAULT =
  '相册更新与授权审核结果需你同意后，才会推送到微信。每次授权可收 1 条通知。'
const SUBSCRIBE_DESC_READY = '当前已有可用通知额度。额度用完后请再次点击授权。'

Page({
  data: {
    isLoggedIn: false,
    phoneDesc: '登录后可绑定',
    platformNotice: HOME_PLATFORM_IDENTITY,
    subscribeBannerDesc: SUBSCRIBE_DESC_DEFAULT,
    subscribeButtonText: '开启微信通知',
  },

  onShow() {
    this.syncLoginState()
    this.loadSubscribeStatus()
  },

  syncLoginState() {
    const loggedIn = isLoggedIn()
    const { user } = getSession()
    let phoneDesc = '登录后可绑定'
    if (loggedIn && user) {
      phoneDesc = user.isPhoneBound
        ? maskPhone(user.phone || user.phoneNumber || '')
        : '未绑定，点击绑定'
    }
    this.setData({ isLoggedIn: loggedIn, phoneDesc })
  },

  async loadSubscribeStatus() {
    if (!isLoggedIn()) {
      this.setData({
        subscribeBannerDesc: SUBSCRIBE_DESC_DEFAULT,
        subscribeButtonText: '开启微信通知',
      })
      return
    }
    try {
      const status = await fetchUserSubscribeStatus('default')
      const needsPrompt = Boolean(status && status.needsPrompt)
      this.setData({
        subscribeBannerDesc: needsPrompt ? SUBSCRIBE_DESC_DEFAULT : SUBSCRIBE_DESC_READY,
        subscribeButtonText: needsPrompt ? '开启微信通知' : '再次授权',
      })
    } catch (e) {
      this.setData({
        subscribeBannerDesc: SUBSCRIBE_DESC_DEFAULT,
        subscribeButtonText: '开启微信通知',
      })
    }
  },

  onSubscribeWechat() {
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
    if (key === 'phone') {
      if (!this.data.isLoggedIn) {
        wx.showToast({ title: '请先登录', icon: 'none' })
        return
      }
      wx.navigateBack({
        fail() {
          wx.navigateTo({ url: '/pages/mine/profile/index' })
        },
      })
      return
    }
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
