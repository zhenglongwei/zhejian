const {
  fetchUserAuthorizations,
  fetchServiceAlbum,
  prepareServiceAuthorizePreview,
  submitServiceAlbumAuthorization,
  withdrawAuthorization,
} = require('../../../services/service-album')
const { enrichAuthorizationItem } = require('../../../utils/service-album-display')
const { isLoggedIn, checkAuth } = require('../../../utils/auth')
const { requestUserNotificationSubscribe } = require('../../../utils/subscribe-message')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    needLogin: false,
    needPhone: false,
    list: [],
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    authSheetVisible: false,
    authChecked: false,
    authTier: 'named',
    authSubmitting: false,
    withdrawingId: '',
    withdrawSheetVisible: false,
    withdrawSheetLoading: false,
    pendingWithdrawAlbumId: '',
  },

  onShow() {
    this.loadList()
  },

  onPullDownRefresh() {
    this.loadList().finally(() => wx.stopPullDownRefresh())
  },

  async loadList(options = {}) {
    const { silent = false } = options
    if (!isLoggedIn()) {
      this.setData({
        status: 'unauthenticated',
        needLogin: true,
        needPhone: false,
        list: [],
      })
      return
    }

    const auth = checkAuth({ needPhone: true })
    if (!auth.ok) {
      this.setData({
        status: 'unauthenticated',
        needLogin: auth.reason !== 'bindPhone',
        needPhone: auth.reason === 'bindPhone',
        list: [],
      })
      return
    }

    if (!silent) {
      this.setData({ status: 'loading', errorMessage: '' })
    }
    try {
      const raw = await fetchUserAuthorizations()
      const withdrawingId = this.data.withdrawingId
      const list = (raw || []).map((item) =>
        enrichAuthorizationItem({
          ...item,
          withdrawing: withdrawingId === item.albumId,
        })
      )
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

  onRetry() {
    this.loadList()
  },

  onLoginTap() {
    this.setData({
      loginSheetVisible: true,
      loginSheetMode: this.data.needPhone ? 'bindPhone' : 'login',
    })
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
  },

  onLoginSheetSuccess(e) {
    const detail = (e && e.detail) || {}
    const { step, user } = detail
    if (step === 'login' && user && !user.isPhoneBound) {
      return
    }
    this.closeLoginSheet()
    setTimeout(() => this.loadList(), 50)
  },

  async loadActionDetail(albumId) {
    const detail = await fetchServiceAlbum(albumId)
    this.actionAlbumId = albumId
    this.setData({ actionDetail: detail })
    return detail
  },

  async onAuthorize(e) {
    const { id } = e.detail || {}
    if (!id || this.data.authSubmitting) return
    try {
      wx.showLoading({ title: '加载中', mask: true })
      await this.loadActionDetail(id)
      wx.hideLoading()
      this.setData({
        authSheetVisible: true,
        authChecked: false,
        authTier: 'named',
      })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    }
  },

  onCloseAuthSheet() {
    this.setData({ authSheetVisible: false })
  },

  onAuthCheckToggle() {
    this.setData({ authChecked: !this.data.authChecked })
  },

  onAuthTierChange(e) {
    const tier = e.detail && e.detail.tier
    if (tier !== 'named' && tier !== 'anonymous') return
    this.setData({ authTier: tier })
  },

  onSubmitAuth() {
    const { actionDetail, authChecked, authSubmitting } = this.data
    if (!actionDetail || authSubmitting) return
    if (!authChecked) {
      wx.showToast({ title: '请先勾选确认项', icon: 'none' })
      return
    }
    this.setData({ authSheetVisible: false })
    this.openAuthorizePreview()
  },

  async openAuthorizePreview() {
    const albumId = this.actionAlbumId
    if (!albumId) return
    this.setData({ authSubmitting: true })
    try {
      wx.showLoading({ title: '加载预览', mask: true })
      const preview = await prepareServiceAuthorizePreview(albumId)
      wx.hideLoading()
      wx.navigateTo({
        url: `/pages/desensitize/preview/index?taskId=${preview.taskId}&albumId=${preview.albumId}&fromPreMask=${preview.fromPreMask ? 1 : 0}&source=service&tier=${this.data.authTier}`,
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({
        title: (e && e.message) || '预览加载失败',
        icon: 'none',
      })
    } finally {
      this.setData({ authSubmitting: false })
    }
  },

  onRejectAuth() {
    const { actionDetail, authSubmitting } = this.data
    if (!actionDetail || authSubmitting) return
    wx.showModal({
      title: '拒绝公示',
      content: '拒绝后，本次服务相册仍仅作为你的私密记录保存，不会生成公开案例。',
      confirmText: '确认拒绝',
      cancelText: '再想想',
      success: (res) => {
        if (!res.confirm) return
        this.submitAuthDecision(false)
      },
    })
  },

  async submitAuthDecision(agreed) {
    const albumId = this.actionAlbumId
    if (!albumId) return
    this.setData({ authSubmitting: true })
    try {
      wx.showLoading({ title: '提交中', mask: true })
      await submitServiceAlbumAuthorization(albumId, { agreed })
      wx.hideLoading()
      wx.showToast({
        title: agreed ? '已授权公示' : '已记录你的选择',
        icon: 'success',
      })
      if (agreed) {
        requestUserNotificationSubscribe('authorize')
      }
      await this.loadList({ silent: true })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({
        title: (e && e.message) || '提交失败',
        icon: 'none',
      })
    } finally {
      this.setData({ authSubmitting: false })
    }
  },

  onOpenBenefitPolicy() {
    wx.navigateTo({ url: '/pages/benefit-sharing/index' })
  },

  onWithdraw(e) {
    const { id } = e.detail
    if (!id || this.data.withdrawingId || this.data.withdrawSheetVisible) return
    this.setData({
      withdrawSheetVisible: true,
      pendingWithdrawAlbumId: id,
    })
  },

  onWithdrawSheetClose() {
    if (this.data.withdrawSheetLoading) return
    this.setData({
      withdrawSheetVisible: false,
      pendingWithdrawAlbumId: '',
    })
  },

  onWithdrawSheetConfirm() {
    const albumId = this.data.pendingWithdrawAlbumId
    if (!albumId || this.data.withdrawSheetLoading) return
    this.setData({ withdrawSheetVisible: false, withdrawSheetLoading: true })
    this.doWithdraw(albumId)
  },

  async doWithdraw(albumId) {
    this.setData({ withdrawingId: albumId })
    this.syncListWithdrawing(albumId)
    try {
      await withdrawAuthorization(albumId)
      wx.showToast({ title: '已撤回授权', icon: 'success' })
      await this.loadList({ silent: true })
    } catch (e) {
      wx.showToast({
        title: (e && e.message) || '撤回失败',
        icon: 'none',
      })
    } finally {
      this.setData({
        withdrawingId: '',
        withdrawSheetLoading: false,
        pendingWithdrawAlbumId: '',
      })
      this.syncListWithdrawing('')
    }
  },

  syncListWithdrawing(withdrawingId) {
    const list = (this.data.list || []).map((item) =>
      enrichAuthorizationItem({
        ...item,
        withdrawing: withdrawingId === item.albumId,
      })
    )
    this.setData({ list })
  },
})
