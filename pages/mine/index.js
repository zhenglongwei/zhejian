const { fetchMineSummary } = require('../../services/user')
const { fetchUserServiceAlbums } = require('../../services/service-album')
const { isLoggedIn, checkAuth, syncAppSession } = require('../../utils/auth')
const { buildMineMenuSections } = require('../../constants/mine-menu')
const { HOME_PLATFORM_IDENTITY } = require('../../constants/home-entries')
const { enrichServiceAlbumListItem } = require('../../utils/service-album-display')
const { TOOL_HELP_CONTENT } = require('../../constants/help-content')

const MINE_ALBUM_PREVIEW_LIMIT = 3

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    isLoggedIn: false,
    user: null,
    menuSections: buildMineMenuSections({}),
    albumPreview: [],
    showAlbumPreview: false,
    showAlbumEmpty: false,
    albumPendingAuthBadge: '',
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    loginSheetBindContext: 'album',
    platformNotice: HOME_PLATFORM_IDENTITY,
  },

  onLoad() {
    syncAppSession()
  },

  onShow() {
    this.loadPage()
  },

  onPullDownRefresh() {
    this.loadPage().finally(() => wx.stopPullDownRefresh())
  },

  buildBadges(summary) {
    const source = summary || {}
    const format = (n) => {
      const count = Number(n) || 0
      if (count <= 0) return ''
      return count > 99 ? '99+' : String(count)
    }
    return {
      consultPending: format(source.consultPending),
      albumPendingAuth: format(source.albumPendingAuth),
      unreadNotification: format(source.unreadNotificationCount),
    }
  },

  syncMenuSections(badges) {
    this.setData({ menuSections: buildMineMenuSections(badges) })
  },

  async loadPage() {
    const loggedIn = isLoggedIn()
    if (!loggedIn) {
      this.syncMenuSections({})
      this.setData({
        status: 'normal',
        isLoggedIn: false,
        user: null,
        errorMessage: '',
        albumPreview: [],
        showAlbumPreview: false,
        showAlbumEmpty: false,
        albumPendingAuthBadge: '',
      })
      return
    }

    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const summary = await fetchMineSummary()
      if (!summary) {
        this.syncMenuSections({})
        this.setData({
          status: 'normal',
          isLoggedIn: false,
          user: null,
          albumPreview: [],
          showAlbumPreview: false,
          showAlbumEmpty: false,
          albumPendingAuthBadge: '',
        })
        return
      }

      const badges = this.buildBadges(summary)
      let albumPreview = []
      let showAlbumPreview = false
      let showAlbumEmpty = false

      const auth = checkAuth({ needPhone: false })
      if (auth.ok) {
        try {
          const raw = await fetchUserServiceAlbums({ tab: 'private' })
          albumPreview = (raw || [])
            .slice(0, MINE_ALBUM_PREVIEW_LIMIT)
            .map((item) => enrichServiceAlbumListItem(item, { listTab: 'private' }))
          showAlbumPreview = albumPreview.length > 0
          showAlbumEmpty = !(raw || []).length
        } catch (e) {
          // 摘要区失败不阻断菜单
        }
      }

      this.syncMenuSections(badges)
      this.setData({
        status: 'normal',
        isLoggedIn: true,
        user: summary.user,
        albumPreview,
        showAlbumPreview,
        showAlbumEmpty,
        albumPendingAuthBadge: badges.albumPendingAuth,
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '数据加载失败，请下拉刷新或稍后重试。',
      })
    }
  },

  onRetry() {
    this.loadPage()
  },

  openLoginSheet(mode = 'auto', bindContext = 'album') {
    this.setData({
      loginSheetVisible: true,
      loginSheetMode: mode,
      loginSheetBindContext: bindContext,
    })
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
  },

  onLoginSheetSuccess() {
    this.closeLoginSheet()
    this.loadPage()
  },

  onUserAreaTap() {
    if (this.data.isLoggedIn) {
      if (!(this.data.user && this.data.user.isPhoneBound)) {
        this.openLoginSheet('bindPhone')
      }
      return
    }
    this.openLoginSheet('login')
  },

  onLoginTap() {
    this.openLoginSheet('login')
  },

  onBindPhoneTap() {
    this.openLoginSheet('bindPhone')
  },

  guardProtectedEntry(needPhone = false) {
    const auth = checkAuth({ needPhone })
    if (!auth.ok) {
      this.openLoginSheet(auth.reason === 'bindPhone' ? 'bindPhone' : 'login')
      return false
    }
    return true
  },

  findMenuItem(key) {
    for (const section of this.data.menuSections) {
      const item = section.items.find((entry) => entry.key === key)
      if (item) return { section: section.key, item }
    }
    return null
  },

  showPlaceholder(key) {
    wx.showToast({
      title: `${key === 'settings' ? '设置' : '功能'}将在后续版本开放`,
      icon: 'none',
    })
  },

  onViewAllAlbums() {
    if (!this.guardProtectedEntry(true)) return
    wx.navigateTo({ url: '/pages/album/list/index' })
  },

  onAlbumCardTap(e) {
    const albumId = (e.detail && e.detail.id) || ''
    if (!albumId) return
    wx.navigateTo({ url: `/pages/album/detail/index?albumId=${albumId}` })
  },

  onMenuCellTap(e) {
    const { key } = e.currentTarget.dataset
    const found = this.findMenuItem(key)
    if (!found) return

    const { section, item } = found

    if (section === 'public') {
      if (key === 'merchant') {
        if (this._navigating) return
        this._navigating = true
        wx.navigateTo({
          url: '/packageMerchant/pages/workbench/index',
          complete: () => {
            setTimeout(() => {
              this._navigating = false
            }, 400)
          },
        })
        return
      }
      this.onPublicMenuTap({ currentTarget: { dataset: { key } } })
      return
    }

    if (!this.guardProtectedEntry(item.needPhone)) return

    if (item.url) {
      if (this._navigating) return
      this._navigating = true
      wx.navigateTo({
        url: item.url,
        complete: () => {
          setTimeout(() => {
            this._navigating = false
          }, 400)
        },
      })
      return
    }
    this.showPlaceholder(key)
  },

  onPublicMenuTap(e) {
    const { key } = e.currentTarget.dataset
    if (key === 'help') {
      wx.showModal({
        title: '使用说明与帮助',
        content: TOOL_HELP_CONTENT,
        showCancel: false,
        confirmText: '知道了',
      })
      return
    }
    if (key === 'support') {
      wx.showToast({ title: '客服功能将在后续版本开放', icon: 'none' })
    }
  },
})
