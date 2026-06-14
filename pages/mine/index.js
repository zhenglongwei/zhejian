const { fetchMineSummary, updateUserProfile } = require('../../services/user')
const { uploadImage } = require('../../utils/media-upload')
const { fetchUserServiceAlbums } = require('../../services/service-album')
const { isLoggedIn, checkAuth, syncAppSession } = require('../../utils/auth')
const { buildMineMenuSections } = require('../../constants/mine-menu')
const { HOME_PLATFORM_IDENTITY } = require('../../constants/home-entries')
const { hasUnreadAlbums } = require('../../utils/album-unread-hint')
const { openPlatformSupportContact } = require('../../utils/support-contact')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    isLoggedIn: false,
    user: null,
    menuSections: buildMineMenuSections({}),
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    loginSheetBindContext: 'album',
    platformNotice: HOME_PLATFORM_IDENTITY,
    avatarPreview: '',
    profileUpdating: false,
  },

  onLoad() {
    syncAppSession()
    this._profileUpdating = false
  },

  onShow() {
    if (this.isAvatarFlowActive()) return
    const silent = this.data.isLoggedIn && this.data.status === 'normal'
    this.loadPage({ silent })
  },

  isAvatarFlowActive() {
    return Boolean(
      this._profileUpdating ||
        this.data.profileUpdating ||
        this.data.avatarPreview,
    )
  },

  markAvatarPicking(tempPath) {
    this._profileUpdating = true
    this.setData({
      profileUpdating: true,
      avatarPreview: tempPath || '',
    })
  },

  clearAvatarPicking() {
    this._profileUpdating = false
    this.setData({ profileUpdating: false })
  },

  resetAvatarPreview() {
    this.setData({ avatarPreview: '' })
    const header = this.selectComponent('#mineUserHeader')
    if (header && typeof header.clearLocalAvatarPreview === 'function') {
      header.clearLocalAvatarPreview()
    }
  },

  onPullDownRefresh() {
    this.loadPage().finally(() => wx.stopPullDownRefresh())
  },

  buildBadges(summary, albumUnread) {
    const source = summary || {}
    const format = (n) => {
      const count = Number(n) || 0
      if (count <= 0) return ''
      return count > 99 ? '99+' : String(count)
    }
    const pendingAuth = Number(source.albumPendingAuth) || 0
    return {
      unreadNotification: format(source.unreadNotificationCount),
      albumUnread: Boolean(albumUnread),
      albumPendingAuth: format(pendingAuth),
    }
  },

  syncMenuSections(badges) {
    this.setData({ menuSections: buildMineMenuSections(badges) })
  },

  async loadAlbumUnreadHint() {
    try {
      const [privateList, publicList] = await Promise.all([
        fetchUserServiceAlbums({ tab: 'private' }),
        fetchUserServiceAlbums({ tab: 'public' }),
      ])
      return hasUnreadAlbums([...(privateList || []), ...(publicList || [])])
    } catch (e) {
      return false
    }
  },

  async loadPage(options = {}) {
    if (this.isAvatarFlowActive()) return

    const loggedIn = isLoggedIn()
    if (!loggedIn) {
      this.syncMenuSections({})
      this.setData({
        status: 'normal',
        isLoggedIn: false,
        user: null,
        errorMessage: '',
      })
      return
    }

    const silent = Boolean(options.silent)
    if (!silent) {
      this.setData({ status: 'loading', errorMessage: '' })
    }
    try {
      const summary = await fetchMineSummary()
      if (!summary) {
        this.syncMenuSections({})
        this.setData({
          status: 'normal',
          isLoggedIn: false,
          user: null,
          errorMessage: '',
        })
        return
      }

      const auth = checkAuth({ needPhone: false })
      let albumUnread = false
      if (auth.ok) {
        albumUnread = await this.loadAlbumUnreadHint()
      }

      const badges = this.buildBadges(summary, albumUnread)
      this.syncMenuSections(badges)
      this.setData({
        status: 'normal',
        isLoggedIn: true,
        user: summary.user,
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

  async onAvatarChoose(e) {
    const tempPath = (e.detail && e.detail.tempPath) || ''
    if (!tempPath) return

    if (!this._profileUpdating) {
      this.markAvatarPicking(tempPath)
    }
    wx.showLoading({ title: '上传中', mask: true })
    try {
      const avatarUrl = await uploadImage(tempPath)
      const user = await updateUserProfile({ avatarUrl })
      this.setData({ user, avatarPreview: '' })
      wx.showToast({ title: '头像已更新', icon: 'success' })
    } catch (err) {
      this.resetAvatarPreview()
      wx.showToast({ title: (err && err.message) || '头像更新失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.clearAvatarPicking()
    }
  },

  async onNicknameChange(e) {
    const nickname = String((e.detail && e.detail.nickname) || '').trim()
    if (this.data.profileUpdating) return

    this.setData({ profileUpdating: true })
    try {
      const user = await updateUserProfile({ nickname })
      this.setData({ user })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '昵称保存失败', icon: 'none' })
    } finally {
      this.setData({ profileUpdating: false })
    }
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
      wx.navigateTo({ url: '/pages/mine/help/index' })
      return
    }
    if (key === 'support') {
      openPlatformSupportContact()
    }
  },
})
