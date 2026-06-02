const { isLoggedIn, clearSession, maskPhone, getSession } = require('../../../utils/auth')
const { clearSearchHistory } = require('../../../utils/search-history')

Page({
  data: {
    isLoggedIn: false,
    phoneDesc: '登录后可绑定',
  },

  onShow() {
    this.syncLoginState()
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

  onCellTap(e) {
    const { key } = e.currentTarget.dataset
    if (key === 'phone') {
      if (!this.data.isLoggedIn) {
        wx.showToast({ title: '请先登录', icon: 'none' })
        return
      }
      wx.navigateBack({
        fail() {
          wx.switchTab({ url: '/pages/mine/index' })
        },
      })
      return
    }
    if (key === 'notify') {
      wx.showModal({
        title: '消息通知',
        content:
          'P0 简版：你可接收咨询/预约、服务相册更新、授权审核结果等通知。订单、支付、评价类通知不在辙见提供。',
        showCancel: false,
      })
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
        content:
          '辙见 — 像一份可翻阅的服务相册，而不是促销传单。提供案例浏览、咨询预约与服务相册工具。',
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
      content: '退出后将无法查看咨询记录、服务相册与授权状态，确定退出吗？',
      success: (res) => {
        if (!res.confirm) return
        clearSession()
        this.syncLoginState()
        wx.showToast({ title: '已退出登录', icon: 'success' })
        setTimeout(() => {
          wx.switchTab({ url: '/pages/mine/index' })
        }, 400)
      },
    })
  },
})
