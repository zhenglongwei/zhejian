const { DEACTIVATE_NOTICE } = require('../../../../constants/settings-legal')
const { isLoggedIn, clearSession } = require('../../../../utils/auth')
const { fetchDeactivateCheck, deactivateAccount } = require('../../../../services/user')

Page({
  data: {
    title: DEACTIVATE_NOTICE.title,
    body: DEACTIVATE_NOTICE.body,
    confirmText: DEACTIVATE_NOTICE.confirmText,
    loading: true,
    loadError: '',
    canDeactivate: false,
    blockers: [],
    submitting: false,
  },

  onLoad() {
    if (!isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 400)
      return
    }
    this.loadCheck()
  },

  async loadCheck() {
    this.setData({ loading: true, loadError: '' })
    try {
      const data = await fetchDeactivateCheck()
      this.setData({
        loading: false,
        canDeactivate: Boolean(data && data.canDeactivate),
        blockers: (data && data.blockers) || [],
      })
    } catch (e) {
      this.setData({
        loading: false,
        loadError: (e && e.message) || '加载失败，请稍后重试',
      })
    }
  },

  onRetryCheck() {
    this.loadCheck()
  },

  onCancel() {
    wx.navigateBack()
  },

  onConfirm() {
    if (this.data.submitting || this.data.loading) return
    if (!this.data.canDeactivate) {
      const msg = (this.data.blockers[0] && this.data.blockers[0].message) || '当前暂无法注销'
      wx.showToast({ title: msg, icon: 'none' })
      return
    }

    wx.showModal({
      title: '最后确认',
      content: '注销后无法恢复账号登录，确定继续吗？',
      confirmText: '确认注销',
      confirmColor: '#E34D59',
      success: (res) => {
        if (!res.confirm) return
        this.submitDeactivate()
      },
    })
  },

  async submitDeactivate() {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      await deactivateAccount()
      clearSession()
      wx.showToast({ title: '账号已注销', icon: 'success' })
      setTimeout(() => {
        const { reLaunchAppHome } = require('../../../../utils/app-home')
        reLaunchAppHome()
      }, 500)
    } catch (e) {
      this.setData({ submitting: false })
      const blockers = e && e.data && e.data.blockers
      if (Array.isArray(blockers) && blockers.length) {
        this.setData({
          canDeactivate: false,
          blockers,
        })
      }
      wx.showToast({
        title: (e && e.message) || '注销失败，请稍后重试',
        icon: 'none',
      })
    }
  },
})
