const { fetchUserFavorites, removeFavorite } = require('../../../services/favorite')
const { FAVORITE_LIST_TABS, FAVORITE_NOTICE } = require('../../../constants/favorite-list-tabs')
const { enrichFavoriteListItem } = require('../../../utils/favorite-display')
const { isLoggedIn, checkAuth } = require('../../../utils/auth')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    needLogin: false,
    needPhone: false,
    tabs: FAVORITE_LIST_TABS,
    activeTab: 'store',
    list: [],
    noticeText: FAVORITE_NOTICE,
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    loginSheetBindContext: 'favorite',
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
        errorMessage: '',
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
        errorMessage: '',
      })
      return
    }

    this.setData({ status: 'loading', errorMessage: '', needLogin: false, needPhone: false })
    try {
      const data = await fetchUserFavorites({ type: this.data.activeTab })
      const list = (data?.list || []).map(enrichFavoriteListItem)
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

  onTabChange(e) {
    const { key } = e.detail
    if (key === this.data.activeTab) return
    this.setData({ activeTab: key })
    this.loadList()
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

  onGoBrowse() {
    const path =
      this.data.activeTab === 'service' ? '/pages/service/index' : '/pages/store/index'
    wx.navigateTo({ url: path })
  },

  async onCancelFavorite(e) {
    const { type, targetId } = e.currentTarget.dataset
    if (!type || !targetId || this._cancelBusy) return
    this._cancelBusy = true
    try {
      await removeFavorite(type, targetId)
      wx.showToast({ title: '已取消收藏', icon: 'none' })
      await this.loadList()
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
    } finally {
      this._cancelBusy = false
    }
  },

  onStoreTap(e) {
    const storeId = e.detail?.storeId
    if (!storeId) return
    wx.navigateTo({ url: `/pages/store/detail/index?id=${storeId}` })
  },

  onServiceTap(e) {
    const serviceId = e.detail?.serviceId || e.currentTarget.dataset.id
    if (!serviceId) return
    wx.navigateTo({ url: `/pages/service/detail/index?id=${serviceId}` })
  },

  onCaseTap(e) {
    const caseId = e.detail?.caseId || e.currentTarget.dataset.id
    if (!caseId) return
    wx.navigateTo({ url: `/pages/case/detail/index?id=${caseId}` })
  },
})
