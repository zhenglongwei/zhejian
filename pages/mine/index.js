const { fetchMineSummary, updateUserProfile } = require('../../services/user')
const { uploadImage } = require('../../utils/media-upload')
const { fetchUserServiceAlbums } = require('../../services/service-album')
const { isLoggedIn, checkAuth, syncAppSession } = require('../../utils/auth')
const {
  buildMineMenuSections,
  MINE_TOOL_MENUS,
  MINE_PUBLIC_MENUS,
  MINE_MERCHANT_ITEM,
  MINE_CORE_MENUS,
} = require('../../constants/mine-menu')
const { attachNavIcon } = require('../../constants/nav-icons')
const { enrichServiceAlbumListItem } = require('../../utils/service-album-display')
const { HOME_PLATFORM_IDENTITY } = require('../../constants/home-entries')
const { hasUnreadAlbums } = require('../../utils/album-unread-hint')
const { openPlatformSupportContact } = require('../../utils/support-contact')
const { buildMineEarningsPreview } = require('../../constants/mine-earnings')

const SECONDARY_MENU_KEYS = ['authorize', 'message', 'vehicle', 'settings']

const SECONDARY_MENU_TONES = {
  authorize: 'authorize',
  message: 'message',
  vehicle: 'vehicle',
  settings: 'settings',
}

function buildStatusPills(badges = {}) {
  const pills = []
  if (badges.albumUnread) {
    pills.push({ key: 'albumUnread', label: '相册有更新', emphasis: true, tone: 'primary' })
  }
  const pendingAuth = Number(badges.albumPendingAuth) || 0
  if (pendingAuth > 0) {
    pills.push({
      key: 'pendingAuth',
      label: `${pendingAuth} 本待授权`,
      emphasis: true,
      tone: 'success',
    })
  }
  const unread = Number(badges.unreadNotification) || 0
  if (unread > 0) {
    pills.push({
      key: 'unread',
      label: `${unread} 条消息`,
      emphasis: false,
      tone: 'info',
    })
  }
  if (!pills.length) {
    pills.push({ key: 'ok', label: '暂无待处理', emphasis: false, tone: 'calm' })
  }
  return pills
}

function attachMenuBadge(item, badges) {
  const badge = item.badgeKey && badges[item.badgeKey] ? badges[item.badgeKey] : ''
  const dot = Boolean(item.dotKey && badges[item.dotKey])
  return attachNavIcon({
    ...item,
    desc: item.desc || '',
    badge,
    dot,
    tone: SECONDARY_MENU_TONES[item.key] || 'settings',
  })
}

function buildSecondaryMenus(badges = {}) {
  const pool = [...MINE_CORE_MENUS.filter((item) => item.key !== 'album'), ...MINE_TOOL_MENUS]
  return pool
    .filter((item) => SECONDARY_MENU_KEYS.includes(item.key))
    .map((item) => attachMenuBadge(item, badges))
}

function buildFooterMenus() {
  return [...MINE_PUBLIC_MENUS, MINE_MERCHANT_ITEM].map((item) => attachNavIcon(item))
}

function buildAlbumRail(albums = []) {
  if (!albums.length) {
    return [
      {
        id: 'empty',
        action: 'list',
        variant: 'mine__album-tile--hero',
        showFrame: true,
        coverUrl: '',
        title: '暂无服务相册',
        meta: '门店创建后会出现在这里',
      },
      {
        id: 'more',
        action: 'list',
        variant: 'mine__album-tile--more',
        showFrame: false,
        title: '查看全部',
        meta: '',
      },
    ]
  }
  const tiles = albums.slice(0, 3).map((album, index) => ({
    id: album.albumId,
    albumId: album.albumId,
    action: 'detail',
    variant: index === 0 ? 'mine__album-tile--hero' : '',
    showFrame: true,
    coverUrl: album.coverUrl || '',
    title: album.serviceName || '服务相册',
    meta: album.updatedAtText ? `更新于 ${album.updatedAtText}` : '',
    dot: Boolean(album.hasUnreadUpdate),
  }))
  tiles.push({
    id: 'more',
    action: 'list',
    variant: 'mine__album-tile--more',
    showFrame: false,
    title: '查看全部',
    meta: '',
  })
  return tiles
}

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    isLoggedIn: false,
    user: null,
    menuSections: buildMineMenuSections({}),
    statusPills: [],
    albumRail: [],
    secondaryMenus: buildSecondaryMenus({}),
    footerMenus: buildFooterMenus(),
    earningsPreview: buildMineEarningsPreview({ loggedIn: false }),
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

  syncHubMenus(badges, albums = [], loggedIn = false) {
    this.setData({
      menuSections: buildMineMenuSections(badges),
      statusPills: buildStatusPills(badges),
      albumRail: buildAlbumRail(albums),
      secondaryMenus: buildSecondaryMenus(badges),
      footerMenus: buildFooterMenus(),
      earningsPreview: buildMineEarningsPreview({ loggedIn }),
    })
  },

  async loadRecentAlbums() {
    try {
      const [privateList, publicList] = await Promise.all([
        fetchUserServiceAlbums({ tab: 'private' }),
        fetchUserServiceAlbums({ tab: 'public' }),
      ])
      const merged = [...(privateList || []), ...(publicList || [])]
      const sorted = merged
        .slice()
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      return sorted
        .slice(0, 3)
        .map((item) => enrichServiceAlbumListItem(item, { audience: 'user', listTab: 'private' }))
    } catch (e) {
      return []
    }
  },

  syncMenuSections(badges) {
    this.syncHubMenus(badges, this.data._recentAlbums || [], this.data.isLoggedIn)
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
      this.syncHubMenus({})
      this.setData({
        status: 'normal',
        isLoggedIn: false,
        user: null,
        errorMessage: '',
        _recentAlbums: [],
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
        this.syncHubMenus({})
        this.setData({
          status: 'normal',
          isLoggedIn: false,
          user: null,
          errorMessage: '',
          _recentAlbums: [],
        })
        return
      }

      const auth = checkAuth({ needPhone: false })
      let albumUnread = false
      let recentAlbums = []
      if (auth.ok) {
        const [unread, albums] = await Promise.all([
          this.loadAlbumUnreadHint(),
          this.loadRecentAlbums(),
        ])
        albumUnread = unread
        recentAlbums = albums
      }

      const badges = this.buildBadges(summary, albumUnread)
      this.syncHubMenus(badges, recentAlbums, true)
      this.setData({
        status: 'normal',
        isLoggedIn: true,
        user: summary.user,
        _recentAlbums: recentAlbums,
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

  onEarningsTap() {
    if (!this.guardProtectedEntry(false)) return
    if (this._navigating) return
    this._navigating = true
    wx.navigateTo({
      url: '/pages/mine/earnings/index',
      complete: () => {
        setTimeout(() => {
          this._navigating = false
        }, 400)
      },
    })
  },

  onAlbumListTap() {
    this.openMenuEntry('album', true)
  },

  onAlbumRailTap(e) {
    const { id, action } = e.currentTarget.dataset
    if (action === 'list' || id === 'more') {
      this.onAlbumListTap()
      return
    }
    if (!id) return
    if (!this.guardProtectedEntry(true)) return
    if (this._navigating) return
    this._navigating = true
    wx.navigateTo({
      url: `/pages/album/detail/index?albumId=${id}`,
      complete: () => {
        setTimeout(() => {
          this._navigating = false
        }, 400)
      },
    })
  },

  openMenuEntry(key, needPhoneFallback = false) {
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
      }
      return
    }
    const needPhone = item.needPhone !== undefined ? item.needPhone : needPhoneFallback
    if (!this.guardProtectedEntry(needPhone)) return
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

  onSecondaryMenuTap(e) {
    const { key } = e.currentTarget.dataset
    this.openMenuEntry(key)
  },

  onFooterMenuTap(e) {
    const { key } = e.currentTarget.dataset
    if (key === 'help') {
      wx.navigateTo({ url: '/pages/mine/help/index' })
      return
    }
    if (key === 'support') {
      openPlatformSupportContact()
      return
    }
    if (key === 'merchant') {
      this.openMenuEntry('merchant')
    }
  },

  onMenuCellTap(e) {
    const { key } = e.currentTarget.dataset
    this.openMenuEntry(key)
  },
})
