const { DEACTIVATE_NOTICE } = require('../../../../constants/settings-legal')
const { isLoggedIn, clearSession } = require('../../../../utils/auth')

Page({
  data: {
    title: DEACTIVATE_NOTICE.title,
    body: DEACTIVATE_NOTICE.body,
    confirmText: DEACTIVATE_NOTICE.confirmText,
  },

  onLoad() {
    if (!isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 400)
    }
  },

  onCancel() {
    wx.navigateBack()
  },

  onConfirm() {
    wx.showModal({
      title: '最后确认',
      content: '注销后无法恢复账号登录，确定继续吗？',
      confirmText: '确认注销',
      confirmColor: '#E34D59',
      success: (res) => {
        if (!res.confirm) return
        clearSession()
        wx.showToast({ title: '注销申请已提交', icon: 'success' })
        setTimeout(() => {
          const { reLaunchAppHome } = require('../../../../utils/app-home')
          reLaunchAppHome()
        }, 500)
      },
    })
  },
})
