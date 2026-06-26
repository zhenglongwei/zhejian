const { isLoggedIn, clearSession } = require('../../../utils/auth')
const { HOME_PLATFORM_IDENTITY } = require('../../../constants/home-entries')

Page({
  data: {
    isLoggedIn: false,
    platformNotice: HOME_PLATFORM_IDENTITY,
  },

  onShow() {
    this.setData({ isLoggedIn: isLoggedIn() })
  },

  onCellTap(e) {
    const { key } = e.currentTarget.dataset
    if (key === 'help') {
      wx.navigateTo({ url: '/pages/mine/help/index' })
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

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后将无法查看服务相册与授权状态，确定退出吗？',
      success: (res) => {
        if (!res.confirm) return
        clearSession()
        this.setData({ isLoggedIn: false })
        wx.showToast({ title: '已退出登录', icon: 'success' })
        setTimeout(() => {
          const { reLaunchAppHome } = require('../../../utils/app-home')
          reLaunchAppHome()
        }, 400)
      },
    })
  },
})
