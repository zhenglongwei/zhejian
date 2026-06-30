const { fetchMineSummary } = require('../../services/user')
const { fetchDefaultVehicle } = require('../../services/vehicle')
const { fetchUserServiceAlbums, fetchUserAuthorizations } = require('../../services/service-album')
const { isLoggedIn, checkAuth, syncAppSession } = require('../../utils/auth')
const { buildMineMenuSections, buildMineHubDock } = require('../../constants/mine-menu')
const { enrichServiceAlbumListItem } = require('../../utils/service-album-display')
const { hasUnreadAlbums } = require('../../utils/album-unread-hint')
const { openPlatformSupportContact } = require('../../utils/support-contact')
const { buildMineEarningsPreview } = require('../../constants/mine-earnings')
const {
  MINE_ALBUM_SECTION_TITLE,
  MINE_ALBUM_EMPTY_HINT,
  MINE_GUEST_TOOL_HINT,
  MINE_SHARE_INCENTIVE_TITLE,
  MINE_H5_OUTLET_TEXT,
  summarizeAuthorizationTodos,
  buildMineTodoSummary,
} = require('../../constants/mine-hub')
const { TOOL_GUEST_ALBUM_HINT } = require('../../constants/tool-login-copy')
const { shouldShowH5PublicCaseLink } = require('../../utils/tool-entry-context')
const { openH5ContentSite } = require('../../constants/h5-links')

function quietHubAlbumTags(item = {}) {
  const reviewPending = item.publicCaseStatus === 'pending_review'
  return {
    ...item,
    statusVariant: reviewPending ? item.statusVariant : 'default',
    visibilityVariant:
      item.visibilityLabel === '审核中' ? item.visibilityVariant : 'default',
  }
}

function enrichRecentAlbums(albums = []) {
  return (albums || [])
    .slice(0, 2)
    .map((item) =>
      quietHubAlbumTags(
        enrichServiceAlbumListItem(item, { audience: 'user', listTab: 'private' })
      )
    )
}

const {
  albumAuthShareData,
  createAlbumAuthShareHandlers,
} = require('../../utils/album-auth-share-handlers')

const authShareHandlers = createAlbumAuthShareHandlers({
  onAuthChanged() {
    return this.loadPage({ silent: true })
  },
})

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    isLoggedIn: false,
    user: null,
    vehicleSummary: '',
    albumHeroCards: [],
    pendingAuthBadge: '',
    hubDock: buildMineHubDock(),
    todoSummary: null,
    shareIncentivePreview: buildMineEarningsPreview({ loggedIn: false }),
    showShareIncentive: false,
    showH5Link: false,
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    loginSheetBindContext: 'album',
    menuSections: buildMineMenuSections({}),
    albumSectionTitle: MINE_ALBUM_SECTION_TITLE,
    albumEmptyHint: MINE_ALBUM_EMPTY_HINT,
    guestToolHint: MINE_GUEST_TOOL_HINT,
    guestAlbumHint: TOOL_GUEST_ALBUM_HINT,
    shareIncentiveTitle: MINE_SHARE_INCENTIVE_TITLE,
    h5OutletText: MINE_H5_OUTLET_TEXT,
    ...albumAuthShareData(),
  },

  ...authShareHandlers,

  onLoad() {
    syncAppSession()
  },

  onShow() {
    this.loadPage({ silent: this.data.isLoggedIn && this.data.status === 'normal' })
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

  syncHubView(badges, albums = [], loggedIn = false, summary = null, vehicleSummary = '', authList = []) {
    const authSummary = summarizeAuthorizationTodos(authList, {
      albumPendingAuth: summary && summary.albumPendingAuth,
    })
    const todoSummary = buildMineTodoSummary(badges, authSummary)
    this.setData({
      menuSections: buildMineMenuSections(badges),
      albumHeroCards: albums,
      pendingAuthBadge: badges.albumPendingAuth || '',
      todoSummary,
      vehicleSummary,
      shareIncentivePreview: buildMineEarningsPreview({ loggedIn }),
      showShareIncentive: loggedIn,
      showH5Link:
        !loggedIn &&
        shouldShowH5PublicCaseLink({
          hasAlbumBindings: Boolean(summary && summary.hasAlbumBindings),
        }),
    })
  },

  async loadVehicleSummary() {
    try {
      const auth = checkAuth({ needPhone: false })
      if (!auth.ok) return ''
      const vehicle = await fetchDefaultVehicle()
      if (!vehicle || !vehicle.displayTitle) return ''
      return vehicle.plateDisplay
        ? `${vehicle.displayTitle} · ${vehicle.plateDisplay}`
        : vehicle.displayTitle
    } catch (e) {
      return ''
    }
  },

  async loadAuthList() {
    try {
      const auth = checkAuth({ needPhone: true })
      if (!auth.ok) return []
      return (await fetchUserAuthorizations()) || []
    } catch (e) {
      return []
    }
  },

  async loadHubAlbums() {
    try {
      const [privateList, publicList] = await Promise.all([
        fetchUserServiceAlbums({ tab: 'private' }),
        fetchUserServiceAlbums({ tab: 'public' }),
      ])
      const merged = [...(privateList || []), ...(publicList || [])]
        .slice()
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      return {
        recent: merged.slice(0, 2),
        albumUnread: hasUnreadAlbums(merged),
      }
    } catch (e) {
      return { recent: [], albumUnread: false }
    }
  },

  async loadPage(options = {}) {
    const loggedIn = isLoggedIn()
    if (!loggedIn) {
      this.syncHubView({}, [], false, null, '')
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
        this.syncHubView({}, [], false, null, '')
        this.setData({
          status: 'normal',
          isLoggedIn: false,
          user: null,
          errorMessage: '',
        })
        return
      }

      const auth = checkAuth({ needPhone: false })
      let recentRaw = []
      let albumUnread = false
      let authList = []
      if (auth.ok) {
        const [hub, authorizations] = await Promise.all([
          this.loadHubAlbums(),
          this.loadAuthList(),
        ])
        recentRaw = hub.recent
        albumUnread = hub.albumUnread
        authList = authorizations
      } else if (Array.isArray(summary.recentAlbums)) {
        recentRaw = summary.recentAlbums
      }

      const recentAlbums = enrichRecentAlbums(recentRaw)
      if (!albumUnread) {
        albumUnread = recentAlbums.some((item) => item.hasUnreadUpdate)
      }

      const vehicleSummary = auth.ok ? await this.loadVehicleSummary() : ''
      const badges = this.buildBadges(summary, albumUnread)
      this.syncHubView(badges, recentAlbums, true, summary, vehicleSummary, authList)
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

  onLoginTap() {
    this.openLoginSheet('login')
  },

  onProfileTap() {
    if (!this.guardProtectedEntry(false)) return
    wx.navigateTo({ url: '/pages/mine/profile/index' })
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

  onShareIncentiveTap() {
    if (!this.guardProtectedEntry(false)) return
    wx.navigateTo({ url: '/pages/mine/earnings/index' })
  },

  onH5OutletTap() {
    openH5ContentSite()
  },

  onHelpFromSettings() {
    wx.navigateTo({ url: '/pages/mine/help/index' })
  },

  onAlbumListTap() {
    this.openMenuEntry('album', true)
  },

  onAuthorizeTap() {
    this.openMenuEntry('authorize')
  },

  onAlbumCardTap(e) {
    const id = (e.detail && e.detail.id) || ''
    if (!id || !this.guardProtectedEntry(true)) return
    wx.navigateTo({ url: `/pages/album/detail/index?albumId=${id}` })
  },

  onAlbumCardAuthorize(e) {
    if (!this.guardProtectedEntry(true)) return
    return this.onCardAuthorize(e)
  },

  onAlbumCardShare(e) {
    if (!this.guardProtectedEntry(true)) return
    return this.onCardShare(e)
  },

  onShareAppMessage() {
    return this.buildShareAppMessagePayload()
  },

  onTodoItemTap(e) {
    const { action } = e.currentTarget.dataset
    if (action === 'authorize') {
      this.onAuthorizeTap()
    }
  },

  openMenuEntry(key, needPhoneFallback = false) {
    const found = this.findMenuItem(key)
    if (!found) return
    const { section, item } = found
    if (section === 'public') {
      if (key === 'merchant') {
        wx.navigateTo({ url: '/packageMerchant/pages/store-picker/index' })
      }
      return
    }
    const needPhone = item.needPhone !== undefined ? item.needPhone : needPhoneFallback
    if (!this.guardProtectedEntry(needPhone)) return
    if (item.url) {
      wx.navigateTo({ url: item.url })
    }
  },

  onDockTap(e) {
    const { key } = e.currentTarget.dataset
    if (key === 'settings') {
      wx.navigateTo({ url: '/pages/mine/settings/index' })
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
})
