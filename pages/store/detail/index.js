const { fetchStoreDetail } = require('../../../services/store')
const { fetchCaseList } = require('../../../services/case')
const { fetchServiceList } = require('../../../services/service')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../services/merchant')
const { isMerchantOwner } = require('../../../utils/auth')
const { openLegacyListPage } = require('../../../utils/legacy-list-nav')
const {
  resolvePageShareContext,
  withStoreContextPath,
  markShareStoreContext,
  TOOL_HOME_PATH,
} = require('../../../utils/share-store-context')
const { buildStoreHeadTags } = require('../../../utils/store-tags')
const {
  buildPublicStoreSharePayload,
  buildPublicStoreTimelinePayload,
  buildStoreShareTitle,
  canShareStore,
  copyPublicStoreWebLink,
} = require('../../../utils/store-share')
const { loadFavoriteState, toggleFavorite } = require('../../../utils/favorite-toggle')

const { DEEP_LINK_SHELL } = require('../../../constants/deep-link-detail')
const { assertOwnerStoreAccess, isStoreContextIsolated } = require('../../../utils/album-store-access')

const PREVIEW_BANNER_TEXT = '以下为车主看到的门店主页展示效果'

const STATUS_TEXT = {
  open: '营业中',
  closed: '休息中',
  holiday: '节假日休息',
  suspended: '暂停预约',
  offline: '暂不可预约',
}

function buildStoreBasicFields(store) {
  if (!store) {
    return {
      storeAddress: '—',
      storeSpecialtiesText: '',
      showStoreSpecialties: false,
      storeContactName: '—',
      storePhone: '',
      storePhoneDisplay: '—',
      storeBusinessHours: '—',
      showStoreNavigate: false,
    }
  }
  const specialties = store.specialties || []
  return {
    storeAddress: store.address || '—',
    storeSpecialtiesText: specialties.join('、'),
    showStoreSpecialties: specialties.length > 0,
    storeContactName: store.contactName || '—',
    storePhone: store.phone || '',
    storePhoneDisplay: store.phone || '—',
    storeBusinessHours: store.businessHours || '—',
    showStoreNavigate: store.latitude != null && store.longitude != null,
  }
}

function buildCertRows(certifications) {
  return (certifications || []).map((item) => ({
    label: item.label,
    value: item.text || '—',
  }))
}

function buildEvidenceTabs(cases = [], services = []) {
  const caseCount = cases.length
  const serviceCount = services.length
  return [
    { key: 'cases', label: caseCount ? `公开案例 (${caseCount})` : '公开案例' },
    { key: 'services', label: serviceCount ? `服务方案 (${serviceCount})` : '服务方案' },
  ]
}

function pickEvidenceTab(cases = [], services = [], preferred = 'cases') {
  const hasCases = cases.length > 0
  const hasServices = services.length > 0
  if (preferred === 'services' && hasServices) return 'services'
  if (preferred === 'cases' && hasCases) return 'cases'
  if (hasCases) return 'cases'
  if (hasServices) return 'services'
  return 'cases'
}

Page({
  data: {
    shellTitle: DEEP_LINK_SHELL.store.title,
    shellSubtitle: DEEP_LINK_SHELL.store.subtitle,
    status: 'loading',
    store: null,
    certRows: [],
    cases: [],
    casesStatus: 'loading',
    services: [],
    servicesStatus: 'loading',
    statusText: '',
    headTags: [],
    errorMessage: '',
    storeAddress: '',
    storeSpecialtiesText: '',
    showStoreSpecialties: false,
    storeContactName: '',
    storePhone: '',
    storePhoneDisplay: '',
    storeBusinessHours: '',
    showStoreNavigate: false,
    evidenceTab: 'cases',
    evidenceTabs: buildEvidenceTabs(),
    showTopShare: false,
    isFavorited: false,
    isPreview: false,
    previewBannerText: PREVIEW_BANNER_TEXT,
    canEditStore: false,
    shareSheetVisible: false,
    shareActionsDisabled: false,
    autoOpenShare: false,
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    loginSheetBindContext: 'favorite',
    pendingFavoriteToggle: false,
    storeIsolated: false,
  },

  onLoad(options) {
    this.pageOptions = options || {}
    this.isPreview = options.preview === '1' || options.preview === 'true'
    this.autoOpenShare = options.share === '1' || options.share === 'true'
    this.preferredEvidenceTab = options.tab === 'services' ? 'services' : 'cases'
    this.storeId = options.id || ''
    const shareCtx = resolvePageShareContext(options, {
      storeId: this.storeId,
      source: 'store_detail',
      autoIsolate: Boolean(this.storeId),
    })
    this.setData({ storeIsolated: shareCtx.isolated })
    if (this.isPreview) {
      wx.setNavigationBarTitle({ title: '门店主页预览' })
    }
    this.initPage()
  },

  onShow() {
    if (this.data.status === 'normal' && this.storeId) {
      this.updateShareMenu(true)
      if (!this.isPreview) {
        this.syncFavoriteState()
      }
    }
  },

  syncFavoriteState() {
    return loadFavoriteState(this, {
      targetType: 'store',
      targetId: this.storeId,
      showFavorite: !this.isPreview,
      injectIntoBottomBar: false,
    })
  },

  async initPage() {
    if (this.isPreview) {
      const ok = await this.ensurePreviewAccess()
      if (!ok) return
    } else if (!this.storeId) {
      this.setData({
        status: 'error',
        errorMessage: '门店不存在',
      })
      return
    } else {
      const access = await assertOwnerStoreAccess(this.storeId, this.pageOptions)
      if (!access.allowed) {
        this.setData({
          status: 'error',
          errorMessage: access.reason || '无法查看该门店',
        })
        return
      }
      if (access.mode === 'album_owner' || access.mode === 'context') {
        this.setData({ storeIsolated: true })
      } else if (access.mode === 'public_guest') {
        this.setData({ storeIsolated: false })
      } else {
        this.setData({
          storeIsolated: isStoreContextIsolated(access, this.data.storeIsolated),
        })
      }
    }
    this.setData({ isPreview: this.isPreview })
    this.loadPage()
  },

  async ensurePreviewAccess() {
    try {
      const profile = await fetchMerchantProfile()
      if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
        wx.showToast({ title: '仅入驻商家可预览', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
        return false
      }
      if (!profile.storeId) {
        wx.showToast({ title: '未找到门店信息', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
        return false
      }
      if (this.storeId && this.storeId !== profile.storeId) {
        wx.showToast({ title: '只能预览本店', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
        return false
      }
      this.storeId = profile.storeId
      this.setData({ canEditStore: isMerchantOwner() })
      return true
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '预览加载失败', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return false
    }
  },

  previewBlockedToast() {
    wx.showToast({ title: '预览模式下不可用', icon: 'none' })
  },

  onPullDownRefresh() {
    this.loadPage().finally(() => wx.stopPullDownRefresh())
  },

  async loadPage() {
    this.setData({ status: 'loading', casesStatus: 'loading', servicesStatus: 'loading', errorMessage: '' })
    try {
      const [store, { list: cases }, { list: services }] = await Promise.all([
        fetchStoreDetail(this.storeId),
        fetchCaseList({ storeId: this.storeId }),
        fetchServiceList({ storeId: this.storeId }),
      ])
      const basicFields = buildStoreBasicFields(store)
      const evidenceTab = pickEvidenceTab(cases, services, this.preferredEvidenceTab)
      this.setData({
        store: { ...store, caseCount: cases.length },
        headTags: buildStoreHeadTags(store),
        certRows: buildCertRows(store.certifications),
        cases,
        services,
        evidenceTab,
        evidenceTabs: buildEvidenceTabs(cases, services),
        statusText: STATUS_TEXT[store.status] || store.status,
        status: 'normal',
        casesStatus: cases.length ? 'normal' : 'empty',
        servicesStatus: services.length ? 'normal' : 'empty',
        shareActionsDisabled: !canShareStore(store),
        showTopShare: canShareStore(store),
        ...basicFields,
      })
      markShareStoreContext({ storeId: store.id, source: 'store_detail' })
      this.updateShareMenu(true)
      if (!this.isPreview) {
        await this.syncFavoriteState()
      }
      if (this.autoOpenShare && canShareStore(store)) {
        this.autoOpenShare = false
        this.setData({ shareSheetVisible: true })
      } else if (this.autoOpenShare && !canShareStore(store)) {
        this.autoOpenShare = false
        wx.showToast({ title: '门店信息未就绪，暂不可分享', icon: 'none' })
      }
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败，请重试',
      })
      this.updateShareMenu(false)
    }
  },

  updateShareMenu(ready) {
    if (ready) {
      wx.showShareMenu({
        withShareTicket: false,
        menus: ['shareAppMessage', 'shareTimeline'],
      })
    } else {
      wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    }
  },

  onOpenShareSheet() {
    if (!canShareStore(this.data.store)) {
      wx.showToast({ title: '门店信息未就绪，暂不可分享', icon: 'none' })
      return
    }
    this.setData({ shareSheetVisible: true })
  },

  onCloseShareSheet() {
    this.setData({ shareSheetVisible: false })
  },

  onShareTimelineGuide() {
    this.setData({ shareSheetVisible: false })
    wx.showModal({
      title: '分享到朋友圈',
      content: '内容已准备好。请点击右上角 ···，选择「分享到朋友圈」。',
      showCancel: false,
      confirmText: '知道了',
    })
  },

  async onCopyPublicWebLink() {
    const { store } = this.data
    if (!store || !store.id) {
      wx.showToast({ title: '门店信息缺失', icon: 'none' })
      return
    }
    try {
      await copyPublicStoreWebLink(store.id, store)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '复制失败', icon: 'none' })
    }
  },

  onShareAppMessage() {
    const { store } = this.data
    if (store && canShareStore(store)) {
      const payload = buildPublicStoreSharePayload(store)
      if (payload) return payload
    }
    if (this.storeId) {
      return {
        title: store && store.name ? buildStoreShareTitle(store) : '辙见 · 门店主页',
        path: withStoreContextPath(`/pages/store/detail/index?id=${this.storeId}`, {
          storeId: this.storeId,
          isolated: true,
        }),
      }
    }
    return { title: '辙见 · 门店主页', path: TOOL_HOME_PATH }
  },

  onShareTimeline() {
    return buildPublicStoreTimelinePayload(this.data.store, this.storeId)
  },

  onRetry() {
    this.loadPage()
  },

  onCaseTap(e) {
    const caseId = e.detail && e.detail.caseId
    if (!caseId || this._caseNavigating) return
    this._caseNavigating = true
    wx.navigateTo({
      url: withStoreContextPath(`/pages/case/detail/index?id=${caseId}`, {
        storeId: this.storeId,
      }),
      complete: () => {
        this._caseNavigating = false
      },
    })
  },

  onSearchStore() {
    if (this.data.isPreview) {
      this.previewBlockedToast()
      return
    }
    wx.navigateTo({
      url: withStoreContextPath(
        `/pages/search/index/index?storeId=${encodeURIComponent(this.storeId)}`,
        { storeId: this.storeId, isolated: true }
      ),
    })
  },

  onEvidenceTabChange(e) {
    const key = e.detail && e.detail.key
    if (!key || key === this.data.evidenceTab) return
    this.setData({ evidenceTab: key })
  },

  onViewAllCases() {
    if (this.data.isPreview) {
      this.previewBlockedToast()
      return
    }
    openLegacyListPage('case', this.storeId)
  },

  onViewAllServices() {
    if (this.data.isPreview) {
      this.previewBlockedToast()
      return
    }
    openLegacyListPage('service', this.storeId)
  },

  onServiceTap(e) {
    const serviceId = e.detail && e.detail.serviceId
    if (!serviceId || this._serviceNavigating) return
    this._serviceNavigating = true
    wx.navigateTo({
      url: withStoreContextPath(`/pages/service/detail/index?id=${serviceId}`, {
        storeId: this.storeId,
      }),
      complete: () => {
        this._serviceNavigating = false
      },
    })
  },

  onCall() {
    this.onCallStore()
  },

  onTopFavoriteTap() {
    toggleFavorite(this, {
      targetType: 'store',
      targetId: this.storeId,
      showFavorite: !this.isPreview,
      injectIntoBottomBar: false,
    })
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false, pendingFavoriteToggle: false })
  },

  onLoginSheetSuccess() {
    const pendingFavorite = this.data.pendingFavoriteToggle
    this.setData({ loginSheetVisible: false, pendingFavoriteToggle: false })
    if (pendingFavorite) {
      toggleFavorite(this, {
        targetType: 'store',
        targetId: this.storeId,
        showFavorite: !this.isPreview,
        injectIntoBottomBar: false,
      })
      return
    }
    this.syncFavoriteState()
  },

  onNavigateTap() {
    if (!this.data.showStoreNavigate) return
    this.onNavigate()
  },

  onNavigate() {
    const { store } = this.data
    if (!store || store.latitude == null || store.longitude == null) {
      wx.showToast({ title: '暂无导航信息', icon: 'none' })
      return
    }
    wx.openLocation({
      latitude: store.latitude,
      longitude: store.longitude,
      name: store.name,
      address: store.address,
      scale: 16,
    })
  },

  onCallStore() {
    const { store } = this.data
    const phone = store && store.phone
    if (!phone) {
      wx.showToast({ title: '暂无门店电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: phone })
  },

  onEditStore() {
    wx.navigateTo({ url: '/packageMerchant/pages/store/edit/index' })
  },
})
