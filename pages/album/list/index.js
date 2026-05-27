const { fetchUserServiceAlbums } = require('../../../services/service-album')
const { SERVICE_ALBUM_LIST_TABS } = require('../../../constants/service-album-status')
const { enrichServiceAlbumListItem } = require('../../../utils/service-album-display')
const { isLoggedIn, checkAuth } = require('../../../utils/auth')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    needLogin: false,
    needPhone: false,
    tabs: SERVICE_ALBUM_LIST_TABS,
    activeTab: 'all',
    list: [],
    loginSheetVisible: false,
    loginSheetMode: 'auto',
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
      const raw = await fetchUserServiceAlbums({ tab: this.data.activeTab })
      const list = (raw || []).map(enrichServiceAlbumListItem)
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

  onCardTap(e) {
    const { id } = e.detail
    if (!id) return
    wx.navigateTo({ url: `/pages/album/detail/index?albumId=${id}` })
  },
})
