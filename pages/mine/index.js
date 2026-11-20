const { fetchMineSummary } = require('../../services/user')
const { fetchUserServiceAlbums, fetchUserAuthorizations } = require('../../services/service-album')
const { isLoggedIn, checkAuth, syncAppSession } = require('../../utils/auth')
const { buildMineMenuSections, buildMineHubDock, buildOwnerHubLinks } = require('../../constants/mine-menu')
const { enrichServiceAlbumListItem } = require('../../utils/service-album-display')
const { compareOwnerAlbums } = require('../../utils/owner-album-rank')
const { openPlatformSupportContact } = require('../../utils/support-contact')
const { buildMineEarningsPreview } = require('../../constants/mine-earnings')
const {
  MINE_ALBUM_EMPTY_TITLE,
  MINE_ALBUM_EMPTY_DESC,
  MINE_ALBUM_EMPTY_H5_LINK,
  MINE_SHARE_INCENTIVE_TITLE,
  MINE_SHARE_INCENTIVE_ENABLED,
  MINE_H5_OUTLET_TEXT,
  summarizeAuthorizationTodos,
  buildMineTodoSummary,
} = require('../../constants/mine-hub')
const { TOOL_GUEST_LOGIN_TITLE } = require('../../constants/tool-login-copy')
const { shouldShowH5PublicCaseLink } = require('../../utils/tool-entry-context')
const { openH5Url, buildCaseListH5Url, buildStoreListH5Url } = require('../../constants/h5-links')

function quietHubAlbumTags(item = {}) {
  return {
    ...item,
    visibilityLabel: '',
    visibilityVariant: 'default',
  }
}

function enrichRecentAlbums(albums = []) {
  return (albums || []).map((item) =>
    quietHubAlbumTags(enrichServiceAlbumListItem(item, { audience: 'user', listTab: 'all' })),
  )
}

function buildHeroOdo(albums = []) {
  const count = (albums || []).length
  if (!count) return null
  let mileage = 0
  for (const album of albums) {
    const raw = Number(album && album.vehicle && album.vehicle.mileage)
    if (Number.isFinite(raw) && raw > mileage) mileage = raw
  }
  if (mileage > 0) {
    const grouped = String(mileage).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return { num: grouped, unit: `km 总里程 · ${count} 次服务` }
  }
  return { num: String(count), unit: '次服务留档' }
}

const {
  albumAuthShareData,
  createAlbumAuthShareHandlers,
} = require('../../utils/album-auth-share-handlers')

const authShareHandlers = createAlbumAuthShareHandlers({
  onAuthChanged() {
    return this.loadPage({ silent: true })
  },
  syncWithdrawingState(withdrawingId) {
    const cards = enrichRecentAlbums(
      (this.data.albumHeroCards || []).map((item) => ({
        ...item,
        withdrawing: withdrawingId === item.albumId,
      }))
    )
    this.setData({ albumHeroCards: cards })
  },
})

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    statusBarHeight: 20,
    isLoggedIn: false,
    user: null,
    welcomeWho: '',
    heroOdo: null,
    albumHeroCards: [],
    pendingAuthBadge: '',
    hubDock: buildMineHubDock(),
    hubLinks: buildOwnerHubLinks(),
    needPhoneHint: false,
    todoSummary: null,
    shareIncentivePreview: buildMineEarningsPreview({ loggedIn: false }),
    showShareIncentive: false,
    showGuestH5Link: false,
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    loginSheetBindContext: 'album',
    menuSections: buildMineMenuSections({}),
    albumEmptyTitle: MINE_ALBUM_EMPTY_TITLE,
    albumEmptyDesc: MINE_ALBUM_EMPTY_DESC,
    albumEmptyH5Link: MINE_ALBUM_EMPTY_H5_LINK,
    shareIncentiveTitle: MINE_SHARE_INCENTIVE_TITLE,
    h5OutletText: MINE_H5_OUTLET_TEXT,
    ...albumAuthShareData(),
  },

  ...authShareHandlers,

  onLoad() {
    syncAppSession()
    const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({ statusBarHeight: sys.statusBarHeight || 20 })
  },

  onShow() {
    const { hideLaunchHomeButton } = require('../../utils/app-role')
    hideLaunchHomeButton()
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
    const pendingOwnerReview = Number(source.albumPendingOwnerReview) || 0
    return {
      unreadNotification: format(source.unreadNotificationCount),
      albumUnread: Boolean(albumUnread),
      albumPendingAuth: format(pendingAuth),
      albumPendingOwnerReview: format(pendingOwnerReview),
    }
  },

  syncHubView(badges, albums = [], loggedIn = false, summary = null, authList = [], heroOdo = null) {
    const authSummary = summarizeAuthorizationTodos(authList, {
      albumPendingAuth: summary && summary.albumPendingAuth,
      albumPendingOwnerReview: summary && summary.albumPendingOwnerReview,
    })
    const todoSummary = buildMineTodoSummary(badges, authSummary)
    const hasAlbumBindings = Boolean(
      (summary && summary.hasAlbumBindings) || (albums && albums.length)
    )
    const showGuestH5Link =
      !loggedIn && shouldShowH5PublicCaseLink({ hasAlbumBindings: false })
    this.setData({
      menuSections: buildMineMenuSections(badges),
      albumHeroCards: (albums || []).slice(0, 2),
      hubLinks: buildOwnerHubLinks(),
      pendingAuthBadge: '',
      todoSummary,
      heroOdo: loggedIn ? heroOdo : null,
      shareIncentivePreview: buildMineEarningsPreview({ loggedIn }),
      showShareIncentive:
        MINE_SHARE_INCENTIVE_ENABLED && loggedIn && hasAlbumBindings,
      showGuestH5Link,
    })
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
      const merged = await fetchUserServiceAlbums({ tab: 'all' })
      const sorted = (merged || []).slice()
      return {
        recent: sorted,
        albumUnread: false,
      }
    } catch (e) {
      return { recent: [], albumUnread: false }
    }
  },

  async loadPage(options = {}) {
    const loggedIn = isLoggedIn()
    if (!loggedIn) {
      this.syncHubView({}, [], false, null)
      this.setData({
        status: 'normal',
        isLoggedIn: false,
        user: null,
        errorMessage: '',
        needPhoneHint: false,
        welcomeWho: TOOL_GUEST_LOGIN_TITLE,
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
        this.syncHubView({}, [], false, null)
        this.setData({
          status: 'normal',
          isLoggedIn: false,
          user: null,
          errorMessage: '',
          welcomeWho: TOOL_GUEST_LOGIN_TITLE,
        })
        return
      }

      const auth = checkAuth({ needPhone: false })
      let recentRaw = []
      let albumUnread = false
      let authList = []
      if (auth.ok) {
        const hub = await this.loadHubAlbums()
        recentRaw = hub.recent
        albumUnread = hub.albumUnread
        authList = await this.loadAuthList()
      } else if (Array.isArray(summary.recentAlbums)) {
        recentRaw = summary.recentAlbums
      }

      const recentAlbums = enrichRecentAlbums(recentRaw).slice().sort(compareOwnerAlbums)
      if (!albumUnread) {
        albumUnread = recentAlbums.some((item) => item.hasUnreadUpdate)
      }

      const badges = this.buildBadges(summary, albumUnread)
      this.syncHubView(badges, recentAlbums, true, summary, authList, buildHeroOdo(recentAlbums))
      const whoName = String(
        (summary.user && (summary.user.nickname || summary.user.phoneDisplay)) || '你好',
      )
      this.setData({
        status: 'normal',
        isLoggedIn: true,
        user: summary.user,
        welcomeWho: `${whoName}，欢迎回来`,
        needPhoneHint: !auth.ok || !checkAuth({ needPhone: true }).ok,
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

  onBindPhoneHintTap() {
    this.openLoginSheet('bindPhone')
  },

  onLoginSheetSuccess() {
    this.closeLoginSheet()
    this.loadPage()
  },

  onLoginTap() {
    this.openLoginSheet('login')
  },

  onHelloTap() {
    if (this.data.isLoggedIn) {
      this.onProfileTap()
      return
    }
    this.onLoginTap()
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
    openH5Url(buildStoreListH5Url())
  },

  onEmptyH5Tap() {
    openH5Url(buildCaseListH5Url())
  },

  onConsultListTap() {
    this.openMenuEntry('consult', true)
  },

  onAlbumListTap() {
    this.openAlbumListTab('all')
  },

  onAlbumActiveTap() {
    this.openAlbumListTab('active')
  },

  onAlbumDoneTap() {
    this.openAlbumListTab('done')
  },

  openAlbumListTab(tab) {
    if (!this.guardProtectedEntry(true)) return
    wx.navigateTo({ url: `/pages/album/list/index?tab=${tab}` })
  },

  onAuthorizeTap() {
    this.openAlbumListTab('done')
  },

  onAlbumCardTap(e) {
    const id = (e.detail && e.detail.id) || ''
    if (!id || !this.guardProtectedEntry(true)) return
    wx.navigateTo({ url: `/pages/album/detail/index?albumId=${id}` })
  },

  onAlbumOwnerShare(e) {
    const id = (e.detail && e.detail.id) || ''
    if (!id || !this.guardProtectedEntry(true)) return
    wx.navigateTo({ url: `/pages/album/owner-share/index?albumId=${id}` })
  },

  onAlbumOwnerReview(e) {
    const id = (e.detail && e.detail.id) || ''
    if (!id || !this.guardProtectedEntry(true)) return
    const title = (e.detail && e.detail.title) || ''
    let url = `/pages/album/engage/index?albumId=${encodeURIComponent(id)}`
    if (title) {
      url += `&albumTitle=${encodeURIComponent(title)}`
    }
    wx.navigateTo({ url })
  },

  onShareAppMessage() {
    return this.buildShareAppMessagePayload()
  },

  onTodoItemTap(e) {
    const { action } = e.currentTarget.dataset
    if (action === 'albumPendingOwnerReview') {
      const pending = (this.data.albumHeroCards || []).find(
        (item) => item && item.pendingOwnerReview && item.albumId
      )
      if (pending) {
        this.onAlbumOwnerReview({
          detail: { id: pending.albumId, title: pending.serviceName || '' },
        })
        return
      }
      this.openAlbumListTab('all')
      return
    }
    if (action === 'authorize' || action === 'albumDone' || action === 'albumPublishable') {
      this.openAlbumListTab('done')
      return
    }
    if (action === 'albumActive' || action === 'albumPublished') {
      this.openAlbumListTab('active')
    }
  },

  openMenuEntry(key, needPhoneFallback = false) {
    const found = this.findMenuItem(key)
    if (!found) return
    const { section, item } = found
    if (section === 'public') {
      if (key === 'merchant') {
        this.switchToMerchant()
      }
      return
    }
    const needPhone = item.needPhone !== undefined ? item.needPhone : needPhoneFallback
    if (!this.guardProtectedEntry(needPhone)) return
    if (item.url) {
      wx.navigateTo({ url: item.url })
    }
  },

  onHubLinkTap(e) {
    const key = e.currentTarget.dataset.key
    const item = (this.data.hubLinks || []).find((row) => row.key === key)
    if (!item) return
    if (item.needPhone && !this.guardProtectedEntry(true)) return
    if (item.url) wx.navigateTo({ url: item.url })
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
      this.switchToMerchant()
    }
  },

  switchToMerchant() {
    const { persistRole, reLaunchRoleHome, ROLE_MERCHANT } = require('../../utils/app-role')
    persistRole(ROLE_MERCHANT).then(() => reLaunchRoleHome(ROLE_MERCHANT))
  },
})
