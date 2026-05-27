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

    this.setData({ status: 'loading', errorMessage: '' })
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

  onLoginSheetSuccess() {
    this.closeLoginSheet()
    this.loadList()
  },

  onViewAlbum(e) {
    const { id } = e.detail
    if (!id) return
    wx.navigateTo({ url: `/pages/album/detail/index?albumId=${id}` })
  },

  onWithdraw(e) {
    const { id } = e.detail
    if (!id || this.data.withdrawingId) return
    wx.showModal({
      title: '撤回授权',
      content: '撤回后公开案例将下架，已产生的传播数据保留后台记录。私密服务相册仍保留。',
      confirmText: '确认撤回',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        this.doWithdraw(id)
      },
    })
  },

  async doWithdraw(albumId) {
    this.setData({ withdrawingId: albumId })
    this.syncListWithdrawing(albumId)
    try {
      wx.showLoading({ title: '处理中', mask: true })
      await withdrawAuthorization(albumId)
      wx.hideLoading()
      wx.showToast({ title: '已撤回授权', icon: 'success' })
      this.loadList()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({
        title: (e && e.message) || '撤回失败',
        icon: 'none',
      })
    } finally {
      this.setData({ withdrawingId: '' })
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
