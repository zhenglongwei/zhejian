const {
  fetchUserAuthorizations,
  withdrawAuthorization,
} = require('../../../services/service-album')
const { enrichAuthorizationItem } = require('../../../utils/service-album-display')
const { isLoggedIn, checkAuth } = require('../../../utils/auth')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    needLogin: false,
    needPhone: false,
    list: [],
    loginSheetVisible: false,
    loginSheetMode: 'auto',
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
    // 微信登录成功但仍需绑定手机号：保持弹窗，等待 getPhoneNumber 完成
    if (step === 'login' && user && !user.isPhoneBound) {
      return
    }
    this.closeLoginSheet()
    setTimeout(() => this.loadList(), 50)
  },

  onViewAlbum(e) {
    const { id } = e.detail
    if (!id) return
    wx.navigateTo({ url: `/pages/album/detail/index?albumId=${id}` })
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
    const list = (this.data.list || []).map((item) => ({
      ...item,
      withdrawing: withdrawingId === item.albumId,
    }))
    this.setData({ list })
  },
})
