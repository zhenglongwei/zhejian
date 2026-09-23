const {
  fetchMerchantProfile,
  refreshMerchantSession,
  fetchMerchantStores,
  switchMerchantStore,
  quickOpenMerchant,
  MERCHANT_STATUS,
} = require('../../../services/merchant')
const { fetchMerchantServiceAlbumList } = require('../../../services/merchant-service-album')
const { fetchMerchantReviewStats } = require('../../../services/merchant-album-review')
const { fetchMerchantStats } = require('../../../services/merchant-stats')
const { fetchMerchantGeoOpportunity } = require('../../../services/merchant-geo')
const { fetchMerchantSubscriptionPanel } = require('../../../services/merchant-subscription')
const { formatCount } = require('../../../utils/merchant-dashboard')
const { enrichMerchantAlbumListItem } = require('../../../utils/service-album-display')
const { isMerchantOwner } = require('../../../utils/auth')
const {
  MERCHANT_WORKBENCH_GATE_NONE,
  MERCHANT_WORKBENCH_GATE_PENDING,
  MERCHANT_WORKBENCH_GATE_NONE_ARCHIVE,
  MERCHANT_WORKBENCH_GATE_PENDING_ARCHIVE,
} = require('../../../constants/merchant-onboarding-copy')
const {
  MERCHANT_ALBUM_SECTION_TITLE,
  MERCHANT_ALBUM_EMPTY_HINT,
  buildMerchantTodoSummary,
  withSetupTodos,
  pickMerchantHubAlbums,
  buildAlbumSectionBadge,
  buildMerchantHubDock,
  buildMerchantHubMoreLinks,
  buildMerchantOverviewLine,
  buildMerchantPlanTag,
  filterMerchantGeoOpportunity,
} = require('../../../constants/merchant-hub')
const { buildMerchantAlbumEntryPath } = require('../../../utils/merchant-album-nav')
const {
  hasWechatArchiveIntent,
  redirectToWechatArchive,
} = require('../../../utils/wechat-archive-intent')

function quietMerchantHubAlbumTags(item = {}) {
  const status = item.status || ''
  const needsColor =
    status === 'pending_review' ||
    status === 'pending_authorization' ||
    status === 'pending_part_confirm' ||
    item.publicCaseStatus === 'pending_review'
  return {
    ...item,
    statusVariant: needsColor ? item.statusVariant : 'default',
  }
}

Page({
  data: {
    status: 'loading',
    gateNone: MERCHANT_WORKBENCH_GATE_NONE,
    gatePending: MERCHANT_WORKBENCH_GATE_PENDING,
    archiveIntent: false,
    profile: null,
    todos: {
      pendingReviews: 0,
      pendingUpload: 0,
      pendingAuth: 0,
      geoEvidenceBlocked: 0,
      activeAlbums: 0,
    },
    overviewLine: '',
    albumHeroCards: [],
    albumSectionBadge: '',
    todoSummary: null,
    hubDock: buildMerchantHubDock(),
    hubMoreLinks: [],
    canManageStaff: false,
    storeOptions: [],
    storePickerIndex: 0,
    canSwitchStore: false,
    canManageStores: false,
    switchingStore: false,
    geoOpportunity: null,
    planTag: null,
    albumSectionTitle: MERCHANT_ALBUM_SECTION_TITLE,
    albumEmptyHint: MERCHANT_ALBUM_EMPTY_HINT,
    opening: false,
  },

  onShow() {
    const { hideLaunchHomeButton } = require('../../../utils/app-role')
    hideLaunchHomeButton()
    this._syncArchiveGateCopy()
    this.loadProfile({ silent: this.data.status === 'normal' })
  },

  _syncArchiveGateCopy() {
    const archiveIntent = hasWechatArchiveIntent()
    this.setData({
      archiveIntent,
      gateNone: archiveIntent
        ? MERCHANT_WORKBENCH_GATE_NONE_ARCHIVE
        : MERCHANT_WORKBENCH_GATE_NONE,
      gatePending: archiveIntent
        ? MERCHANT_WORKBENCH_GATE_PENDING_ARCHIVE
        : MERCHANT_WORKBENCH_GATE_PENDING,
    })
  },

  async loadProfile(options = {}) {
    const silent = Boolean(options.silent)
    if (!silent) {
      this.setData({ status: 'loading' })
    }

    if (!silent) {
      try {
        await refreshMerchantSession()
      } catch (e) {
        // ignore
      }
    }

    const profile = await fetchMerchantProfile()
    if (!profile || profile.status === MERCHANT_STATUS.NONE) {
      this.setData({ status: 'none', profile: null })
      return
    }
    if (
      profile.status === MERCHANT_STATUS.PENDING ||
      profile.status === MERCHANT_STATUS.REJECTED ||
      profile.status === MERCHANT_STATUS.NEED_MODIFY
    ) {
      this.setData({
        status: 'pending',
        profile,
      })
      return
    }
    if (profile.status !== MERCHANT_STATUS.APPROVED) {
      this.setData({ status: 'none', profile: null })
      return
    }
    if (hasWechatArchiveIntent()) {
      redirectToWechatArchive()
      return
    }

    let todos = {
      pendingUpload: 0,
      pendingAuth: 0,
      pendingFollowUp: 0,
      geoEvidenceBlocked: 0,
      activeAlbums: 0,
    }
    let overviewLine = ''
    let storeOptions = []
    let storePickerIndex = 0
    let canSwitchStore = false
    let canManageStores = false
    let geoOpportunity = null
    let albumHeroCards = []
    let planTag = null

    try {
      if (isMerchantOwner()) {
        const storeData = await fetchMerchantStores()
        storeOptions = storeData.list || []
        storePickerIndex = Math.max(
          0,
          storeOptions.findIndex((item) => item.id === profile.storeId)
        )
        canSwitchStore = storeOptions.length > 1
        canManageStores = true
      }
    } catch (e) {
      storeOptions = []
      canManageStores = isMerchantOwner()
    }

    try {
      const canManageStaff = isMerchantOwner()
      const [reviewStats, dashStats, geoOpp, albumList, subPanel] = await Promise.all([
        fetchMerchantReviewStats({ storeId: profile.storeId }).catch(() => ({ pendingReply: 0 })),
        fetchMerchantStats({ storeId: profile.storeId, period: '7d' }).catch(() => null),
        fetchMerchantGeoOpportunity({ storeId: profile.storeId }).catch(() => null),
        fetchMerchantServiceAlbumList({ tab: 'all' }).catch(() => []),
        canManageStaff
          ? fetchMerchantSubscriptionPanel().catch(() => null)
          : Promise.resolve(null),
      ])

      todos = {
        pendingReviews: reviewStats.pendingReply || 0,
      }

      if (dashStats && dashStats.summary) {
        overviewLine = buildMerchantOverviewLine({
          transparency: formatCount(
            dashStats.transparency?.score ?? dashStats.summary.transparencyScore
          ),
        })
      }

      const storeServiceNames = (albumList || [])
        .map((row) => String((row && row.serviceName) || '').trim())
        .filter(Boolean)
      geoOpportunity = filterMerchantGeoOpportunity(geoOpp, storeServiceNames)

      planTag = subPanel
        ? buildMerchantPlanTag(subPanel.subscription, canManageStaff)
        : canManageStaff
          ? buildMerchantPlanTag({ plan: 'free' }, true)
          : null

      const heroes = pickMerchantHubAlbums(albumList || []).map((item) =>
        quietMerchantHubAlbumTags(enrichMerchantAlbumListItem(item))
      )
      albumHeroCards = heroes
    } catch (e) {
      // keep defaults
    }

    const todoSummary = withSetupTodos(buildMerchantTodoSummary(todos), profile)
    const canManageStaff = isMerchantOwner()

    this.setData({
      status: 'normal',
      profile,
      todos,
      todoSummary,
      overviewLine,
      albumHeroCards,
      albumSectionBadge: buildAlbumSectionBadge(todos),
      hubDock: buildMerchantHubDock(todos),
      hubMoreLinks: buildMerchantHubMoreLinks(canManageStaff, todos),
      canManageStaff,
      storeOptions,
      storePickerIndex,
      canSwitchStore,
      canManageStores,
      geoOpportunity,
      planTag,
    })
  },

  async onQuickOpen() {
    if (this.data.opening) return
    this.setData({ opening: true })
    try {
      await quickOpenMerchant()
      wx.showToast({ title: '已开通', icon: 'success' })
      if (hasWechatArchiveIntent()) {
        redirectToWechatArchive()
        return
      }
      await this.loadProfile()
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '开通失败', icon: 'none' })
    } finally {
      this.setData({ opening: false })
    }
  },

  onStoreHeaderChange(e) {
    const index = Number(e.detail && e.detail.index)
    this.onStoreChange({ detail: { value: index } })
  },

  onStoreChange(e) {
    const index = Number(e.detail.value)
    const { storeOptions, profile, canSwitchStore, switchingStore } = this.data
    if (!canSwitchStore || switchingStore || !Number.isFinite(index)) return
    const picked = storeOptions[index]
    if (!picked || picked.id === profile.storeId) return
    this.doSwitchStore(picked.id, index)
  },

  async doSwitchStore(storeId, pickerIndex) {
    if (this.data.switchingStore) return
    this.setData({ switchingStore: true })
    try {
      wx.showLoading({ title: '切换门店', mask: true })
      await switchMerchantStore(storeId)
      wx.hideLoading()
      this.setData({ storePickerIndex: pickerIndex })
      await this.loadProfile({ silent: true })
      wx.showToast({ title: '已切换门店', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      this.setData({
        storePickerIndex: Math.max(
          0,
          this.data.storeOptions.findIndex((item) => item.id === this.data.profile?.storeId)
        ),
      })
      wx.showToast({ title: (e && e.message) || '切换失败', icon: 'none' })
    } finally {
      this.setData({ switchingStore: false })
    }
  },

  onGoOnboarding() {
    wx.navigateTo({ url: '/packageMerchant/pages/onboarding/index' })
  },

  onGoAuth() {
    wx.navigateTo({ url: '/packageMerchant/pages/onboarding/index?mode=auth' })
  },

  onGoStoreEdit() {
    wx.navigateTo({ url: '/packageMerchant/pages/store/edit/index' })
  },

  onRefreshAudit() {
    this.onQuickOpen()
  },

  _navigateTo(url) {
    if (this._navigating) return
    this._navigating = true
    wx.navigateTo({
      url,
      complete: () => {
        setTimeout(() => {
          this._navigating = false
        }, 400)
      },
    })
  },

  onAlbumCardTap(e) {
    const id = (e.detail && e.detail.id) || ''
    if (!id) return
    const item =
      (this.data.albumHeroCards || []).find((row) => row.albumId === id) || { albumId: id }
    this._navigateTo(buildMerchantAlbumEntryPath(id, item))
  },

  onTodoItemTap(e) {
    const { action } = e.currentTarget.dataset
    if (action === 'reviews') {
      this.onReviewList()
      return
    }
    if (action === 'auth') {
      this.onGoAuth()
      return
    }
    if (action === 'storeProfile') {
      this.onGoStoreEdit()
    }
  },

  onDockTap(e) {
    const { key } = e.currentTarget.dataset
    const handlers = {
      createAlbum: () => this.onCreateAlbum(),
      reviews: () => this.onReviewList(),
      services: () => this.onServiceList(),
    }
    const fn = handlers[key]
    if (fn) fn()
  },

  onMoreLinkTap(e) {
    const { key } = e.currentTarget.dataset
    const handlers = {
      storeHome: () => this.onStoreHome(),
      staff: () => this.onStaffManage(),
      switchStore: () => this.onSwitchStore(),
      reviews: () => this.onReviewList(),
      switchOwner: () => this.onSwitchToOwner(),
    }
    const fn = handlers[key]
    if (fn) fn()
  },

  onSwitchToOwner() {
    const { persistRole, reLaunchRoleHome, ROLE_OWNER } = require('../../../utils/app-role')
    persistRole(ROLE_OWNER).then(() => reLaunchRoleHome(ROLE_OWNER))
  },

  onSwitchStore() {
    wx.navigateTo({ url: '/packageMerchant/pages/store-picker/index' })
  },

  onOverviewTap() {
    this.onDashboard()
  },

  onCreateAlbum() {
    this._navigateTo('/packageMerchant/pages/album/create/index')
  },

  onAlbumList(e) {
    const tab =
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) || 'all'
    this._navigateTo(`/packageMerchant/pages/album/list/index?tab=${tab}`)
  },

  onServiceList() {
    this._navigateTo('/packageMerchant/pages/service/list/index')
  },

  onReviewList() {
    this._navigateTo('/packageMerchant/pages/review/list/index?tab=pending')
  },

  onStaffManage() {
    this._navigateTo('/packageMerchant/pages/staff/list/index')
  },

  onDashboard() {
    this._navigateTo('/packageMerchant/pages/dashboard/index')
  },

  onSubscription() {
    this._navigateTo('/packageMerchant/pages/subscription/index')
  },

  onPlanTagTap() {
    this.onSubscription()
  },

  onOpenStoreList() {
    this._navigateTo('/packageMerchant/pages/store-picker/index')
  },

  onStoreHome() {
    this._navigateTo('/packageMerchant/pages/store/edit/index')
  },
})
