const { fetchUserServiceAlbums } = require('../../../services/service-album')
const { SERVICE_ALBUM_LIST_TABS } = require('../../../constants/service-album-status')
const { enrichServiceAlbumListItem } = require('../../../utils/service-album-display')
const { isLoggedIn, checkAuth } = require('../../../utils/auth')
const { markAlbumsSeen } = require('../../../utils/album-unread-hint')
const { openH5ContentSite } = require('../../../constants/h5-links')
const {
  shouldRunInitialShow,
  finishInitialShow,
  markListNeedRefresh,
  consumeListRefresh,
  shouldShowListLoading,
} = require('../../../utils/list-page-show')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    needLogin: false,
    needPhone: false,
    tabs: SERVICE_ALBUM_LIST_TABS,
    activeTab: 'private',
    list: [],
    loginSheetVisible: false,
    loginSheetMode: 'auto',
  },

  onShow() {
    if (shouldRunInitialShow(this)) {
      this.loadList()
        .catch(() => {})
        .finally(() => {
          finishInitialShow(this)
          this.markAllTabsSeen()
        })
      return
    }
    if (consumeListRefresh(this)) {
      this.loadList({ silent: true }).finally(() => this.markAllTabsSeen())
      return
    }
    this.markAllTabsSeen()
  },

  async markAllTabsSeen() {
    if (!isLoggedIn()) return
    const auth = checkAuth({ needPhone: true })
    if (!auth.ok) return
    try {
      const [privateList, publicList] = await Promise.all([
        fetchUserServiceAlbums({ tab: 'private' }),
        fetchUserServiceAlbums({ tab: 'public' }),
      ])
      markAlbumsSeen([...(privateList || []), ...(publicList || [])])
    } catch (e) {
      // ignore
    }
  },

  onPullDownRefresh() {
    this.loadList({ forceLoading: true }).finally(() => wx.stopPullDownRefresh())
  },

  async loadList(options = {}) {
    const { silent = false, forceLoading = false } = options

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

    if (this._listLoading) return
    this._listLoading = true

    const showLoading = forceLoading || shouldShowListLoading(this, silent)
    if (showLoading) {
      this.setData({ status: 'loading', errorMessage: '', needLogin: false, needPhone: false })
    }

    try {
      const raw = await fetchUserServiceAlbums({ tab: this.data.activeTab })
      const listTab = this.data.activeTab
      const list = (raw || []).map((item) =>
        enrichServiceAlbumListItem(item, { listTab })
      )
      if (raw && raw.length) {
        markAlbumsSeen(raw)
      }
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
    } finally {
      this._listLoading = false
    }
  },

  onTabChange(e) {
    const { key } = e.detail
    if (key === this.data.activeTab) return
    this.setData({ activeTab: key })
    this.loadList({ forceLoading: true })
  },

  onRetry() {
    this.loadList({ forceLoading: true })
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
    this.loadList({ forceLoading: true })
  },

  onCardTap(e) {
    const { id } = e.detail
    if (!id) return
    const item = (this.data.list || []).find((row) => row.albumId === id)
    const cover = item && item.coverUrl ? encodeURIComponent(item.coverUrl) : ''
    markListNeedRefresh(this)
    const coverQuery = cover ? `&cover=${cover}` : ''
    wx.navigateTo({ url: `/pages/album/detail/index?albumId=${id}${coverQuery}` })
  },

  onOpenH5Cases() {
    openH5ContentSite()
  },
})
