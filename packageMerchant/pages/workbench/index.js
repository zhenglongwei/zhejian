const {
  fetchMerchantProfile,
  refreshMerchantSession,
  fetchMerchantStores,
  switchMerchantStore,
  MERCHANT_STATUS,
} = require('../../../services/merchant')
const {
  fetchMerchantAlbumStats,
  fetchMerchantServiceAlbumList,
} = require('../../../services/merchant-service-album')
const { fetchMerchantLeadStats } = require('../../../services/merchant-lead')
const { fetchMerchantStats } = require('../../../services/merchant-stats')
const { fetchMerchantGeoOpportunity } = require('../../../services/merchant-geo')
const {
  fetchMerchantCasePublishPanel,
  fetchMerchantCaseArticleExport,
} = require('../../../services/merchant-public-case')
const { copyCaseH5Link, openH5ContentSite } = require('../../../constants/h5-links')
const { formatCount } = require('../../../utils/merchant-dashboard')
const { enrichMerchantAlbumListItem } = require('../../../utils/service-album-display')
const { isMerchantOwner } = require('../../../utils/auth')
const {
  MERCHANT_WORKBENCH_GATE_NONE,
  MERCHANT_WORKBENCH_GATE_PENDING,
} = require('../../../constants/merchant-onboarding-copy')
const {
  MERCHANT_ALBUM_SECTION_TITLE,
  MERCHANT_ALBUM_EMPTY_HINT,
  MERCHANT_CASE_SECTION_TITLE,
  buildMerchantTodoSummary,
  pickMerchantHubAlbums,
  buildAlbumSectionBadge,
  buildMerchantHubDock,
  buildMerchantHubMoreLinks,
  buildMerchantOverviewLine,
} = require('../../../constants/merchant-hub')

const MERCHANT_CASE_PUBLISHED = ['published_h5', 'published_wechat']

function resolveCasePublishTagVariant(publishStatus) {
  if (MERCHANT_CASE_PUBLISHED.includes(publishStatus)) return 'default'
  return 'info'
}

function decorateCasePublishRecent(list = []) {
  return (list || []).map((item) => ({
    ...item,
    publishTagVariant: resolveCasePublishTagVariant(item.publishStatus),
  }))
}

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
    profile: null,
    todos: {
      pendingLeads: 0,
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
    casePublishRecent: [],
    canManageStaff: false,
    storeOptions: [],
    storePickerIndex: 0,
    canSwitchStore: false,
    switchingStore: false,
    geoOpportunity: null,
    albumSectionTitle: MERCHANT_ALBUM_SECTION_TITLE,
    albumEmptyHint: MERCHANT_ALBUM_EMPTY_HINT,
    caseSectionTitle: MERCHANT_CASE_SECTION_TITLE,
  },

  onShow() {
    this.loadProfile({ silent: this.data.status === 'normal' })
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
    if (profile.status === MERCHANT_STATUS.PENDING) {
      this.setData({ status: 'pending', profile })
      return
    }
    if (profile.status === MERCHANT_STATUS.REJECTED || profile.status === MERCHANT_STATUS.NEED_MODIFY) {
      this.setData({
        status: profile.status === MERCHANT_STATUS.NEED_MODIFY ? 'need_modify' : 'rejected',
        profile,
      })
      return
    }
    if (profile.status !== MERCHANT_STATUS.APPROVED) {
      this.setData({ status: 'none', profile: null })
      return
    }

    let todos = {
      pendingLeads: 0,
      pendingUpload: 0,
      pendingAuth: 0,
      geoEvidenceBlocked: 0,
      activeAlbums: 0,
    }
    let overviewLine = ''
    let casePublishRecent = []
    let storeOptions = []
    let storePickerIndex = 0
    let canSwitchStore = false
    let geoOpportunity = null
    let albumHeroCards = []

    try {
      if (isMerchantOwner()) {
        const storeData = await fetchMerchantStores()
        storeOptions = storeData.list || []
        storePickerIndex = Math.max(
          0,
          storeOptions.findIndex((item) => item.id === profile.storeId)
        )
        canSwitchStore = storeOptions.length > 1
      }
    } catch (e) {
      storeOptions = []
    }

    try {
      const [stats, leadStats, dashStats, publishPanel, geoOpp, albumList] =
        await Promise.all([
          fetchMerchantAlbumStats(),
          fetchMerchantLeadStats(profile.storeId),
          fetchMerchantStats({ storeId: profile.storeId, period: '7d' }).catch(() => null),
          fetchMerchantCasePublishPanel({ storeId: profile.storeId }).catch(() => null),
          fetchMerchantGeoOpportunity({ storeId: profile.storeId }).catch(() => null),
          fetchMerchantServiceAlbumList({ tab: 'all' }).catch(() => []),
        ])

      todos = {
        pendingLeads: leadStats.pending || 0,
        pendingUpload: stats.pendingUpload || 0,
        pendingAuth: stats.pendingAuth || 0,
        geoEvidenceBlocked: stats.geoEvidenceBlocked || 0,
        activeAlbums: stats.active || 0,
      }

      if (publishPanel && publishPanel.recent) {
        casePublishRecent = decorateCasePublishRecent(
          (publishPanel.recent || []).slice(0, 3)
        )
      }

      if (dashStats && dashStats.summary) {
        overviewLine = buildMerchantOverviewLine({
          leadSubmit: formatCount(dashStats.summary.leadSubmitCount),
          transparency: formatCount(
            dashStats.transparency?.score ?? dashStats.summary.transparencyScore
          ),
        })
      }

      geoOpportunity = geoOpp || null

      const heroes = pickMerchantHubAlbums(albumList || []).map((item) =>
        quietMerchantHubAlbumTags(enrichMerchantAlbumListItem(item))
      )
      albumHeroCards = heroes
    } catch (e) {
      // keep defaults
    }

    const canManageStaff = isMerchantOwner()
    const todoSummary = buildMerchantTodoSummary(todos)

    this.setData({
      status: 'normal',
      profile,
      todos,
      todoSummary,
      overviewLine,
      albumHeroCards,
      albumSectionBadge: buildAlbumSectionBadge(todos),
      hubDock: buildMerchantHubDock(todos),
      hubMoreLinks: buildMerchantHubMoreLinks(canManageStaff),
      casePublishRecent,
      canManageStaff,
      storeOptions,
      storePickerIndex,
      canSwitchStore,
      geoOpportunity,
    })
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

  onRefreshAudit() {
    wx.navigateTo({ url: '/packageMerchant/pages/onboarding/index' })
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
    this._navigateTo(`/packageMerchant/pages/album/edit/index?albumId=${id}`)
  },

  onTodoItemTap(e) {
    const { action } = e.currentTarget.dataset
    if (action === 'leads') {
      this.onLeadList({ currentTarget: { dataset: { tab: 'pending' } } })
    }
  },

  onDockTap(e) {
    const { key } = e.currentTarget.dataset
    const handlers = {
      createAlbum: () => this.onCreateAlbum(),
      leads: () => this.onLeadList({ currentTarget: { dataset: { tab: 'pending' } } }),
      services: () => this.onServiceList(),
    }
    const fn = handlers[key]
    if (fn) fn()
  },

  onMoreLinkTap(e) {
    const { key } = e.currentTarget.dataset
    const handlers = {
      storeHome: () => this.onStoreHome(),
      editStore: () => this.onEditStore(),
      staff: () => this.onStaffManage(),
    }
    const fn = handlers[key]
    if (fn) fn()
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

  onLeadList(e) {
    const tab =
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) || 'pending'
    this._navigateTo(`/packageMerchant/pages/lead/list/index?tab=${tab}`)
  },

  onStaffManage() {
    this._navigateTo('/packageMerchant/pages/staff/list/index')
  },

  onDashboard() {
    this._navigateTo('/packageMerchant/pages/dashboard/index')
  },

  onStoreHome() {
    const { profile } = this.data
    if (!profile || !profile.storeId) {
      wx.showToast({ title: '未找到门店信息', icon: 'none' })
      return
    }
    this._navigateTo(`/pages/store/detail/index?id=${profile.storeId}&preview=1`)
  },

  onEditStore() {
    this._navigateTo('/packageMerchant/pages/store/edit/index')
  },

  async _copyCaseWechatExport(caseId, field) {
    if (!caseId || this._wechatExportLoading) return
    this._wechatExportLoading = true
    wx.showLoading({ title: '生成中…', mask: true })
    try {
      const data = await fetchMerchantCaseArticleExport(caseId)
      const text = field === 'markdown' ? data.markdown : data.html
      if (!text) {
        wx.showToast({ title: '导出内容为空', icon: 'none' })
        return
      }
      await new Promise((resolve, reject) => {
        wx.setClipboardData({
          data: text,
          success: resolve,
          fail: reject,
        })
      })
      wx.showToast({
        title: field === 'markdown' ? 'Markdown 已复制' : 'HTML 已复制',
        icon: 'none',
        duration: 2500,
      })
    } catch (err) {
      wx.showToast({
        title: (err && err.message) || '导出失败',
        icon: 'none',
      })
    } finally {
      this._wechatExportLoading = false
      wx.hideLoading()
    }
  },

  onCasePublishItemTap(e) {
    const index = e.currentTarget.dataset.index
    const item =
      (typeof index === 'number' && this.data.casePublishRecent[index]) ||
      this.data.casePublishRecent.find(
        (row) =>
          row.caseId === e.currentTarget.dataset.caseId ||
          row.albumId === e.currentTarget.dataset.albumId
      )
    if (!item) return

    const publishedKeys = ['published_h5', 'published_wechat']
    if (publishedKeys.includes(item.publishStatus) || item.h5Url) {
      wx.showActionSheet({
        itemList: ['复制 H5 链接', '复制公众号 HTML', '复制公众号 Markdown'],
        success: (res) => {
          if (res.tapIndex === 0) {
            copyCaseH5Link(item).catch(() => {
              wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' })
            })
            return
          }
          this._copyCaseWechatExport(item.caseId, res.tapIndex === 1 ? 'html' : 'markdown')
        },
      })
      return
    }
    if (item.albumId) {
      this._navigateTo(`/packageMerchant/pages/album/edit/index?albumId=${item.albumId}`)
      return
    }
    if (item.caseId) {
      this._navigateTo('/packageMerchant/pages/album/list/index?tab=pending_auth')
    }
  },
})
