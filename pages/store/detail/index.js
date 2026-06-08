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
const { recordRecentVisit } = require('../../../utils/recent-visit')

const PREVIEW_BANNER_TEXT = '以下为车主看到的门店主页展示效果'

const BOTTOM_LEFT_ACTIONS = [
  { key: 'share', type: 'secondary', text: '分享' },
  { key: 'call', type: 'secondary', text: '电话咨询' },
  { key: 'navigate', type: 'secondary', text: '导航' },
]

/** 商家预览：分享放右侧主按钮，左侧仅保留联系/导航 */
const BOTTOM_LEFT_ACTIONS_PREVIEW = [
  { key: 'call', type: 'secondary', text: '电话咨询' },
  { key: 'navigate', type: 'secondary', text: '导航' },
]

const STATUS_TEXT = {
  open: '营业中',
  closed: '休息中',
  holiday: '节假日休息',
  suspended: '暂停预约',
  offline: '暂不可预约',
}

function buildStoreInfoRows(store) {
  if (!store) return []
  const rows = [
    { label: '地址', value: store.address || '—' },
    { label: '营业时间', value: store.businessHours || '—' },
  ]
  if (store.specialties && store.specialties.length) {
    rows.push({ label: '擅长项目', value: store.specialties.join('、') })
  }
  return rows
}

function buildCertRows(certifications) {
  return (certifications || []).map((item) => ({
    label: item.label,
    value: item.text || '—',
  }))
}

Page({
  data: {
    status: 'loading',
    store: null,
    infoRows: [],
    certRows: [],
    cases: [],
    casesStatus: 'loading',
    services: [],
    servicesStatus: 'loading',
    statusText: '',
    headTags: [],
    errorMessage: '',
    bottomLeftActions: BOTTOM_LEFT_ACTIONS,
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
    this.isPreview = options.preview === '1' || options.preview === 'true'
    this.autoOpenShare = options.share === '1' || options.share === 'true'
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
    this.baseLeftActions = BOTTOM_LEFT_ACTIONS
    return loadFavoriteState(this, {
      targetType: 'store',
      targetId: this.storeId,
      baseLeftActions: this.baseLeftActions,
      showFavorite: !this.isPreview,
    })
  },

  async initPage() {
    if (this.isPreview) {
      const ok = await this.ensurePreviewAccess()
      if (!ok) return
    } else if (!this.storeId) {
      this.storeId = 'store_demo_1'
    }
    this.setData({
      isPreview: this.isPreview,
      bottomLeftActions: this.isPreview ? BOTTOM_LEFT_ACTIONS_PREVIEW : BOTTOM_LEFT_ACTIONS,
    })
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
      this.setData({
        store: { ...store, caseCount: cases.length },
        headTags: buildStoreHeadTags(store),
        infoRows: buildStoreInfoRows(store),
        certRows: buildCertRows(store.certifications),
        cases,
        services,
        statusText: STATUS_TEXT[store.status] || store.status,
        status: 'normal',
        casesStatus: cases.length ? 'normal' : 'empty',
        servicesStatus: services.length ? 'normal' : 'empty',
        shareActionsDisabled: !canShareStore(store),
      })
      markShareStoreContext({ storeId: store.id, source: 'store_detail' })
      recordRecentVisit({
        type: 'store',
        storeId: store.id,
        storeName: store.name,
      })
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
    const { store } = this.data
    if (!store || !store.phone) return
    wx.makePhoneCall({ phoneNumber: store.phone })
  },

  onBottomLeftAction(e) {
    const { key } = e.detail
    if (key === 'favorite') {
      toggleFavorite(this, {
        targetType: 'store',
        targetId: this.storeId,
        baseLeftActions: BOTTOM_LEFT_ACTIONS,
        showFavorite: !this.isPreview,
      })
      return
    }
    if (key === 'share') this.onOpenShareSheet()
    else if (key === 'call') this.onCall()
    else if (key === 'navigate') this.onNavigate()
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
        baseLeftActions: BOTTOM_LEFT_ACTIONS,
        showFavorite: !this.isPreview,
      })
      return
    }
    this.syncFavoriteState()
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

  onMessage() {
    if (this._messageNavigating || !this.storeId) return
    this._messageNavigating = true
    wx.navigateTo({
      url: withStoreContextPath(
        `/pages/consult/submit/index?storeId=${this.storeId}&sourcePage=store`,
        { storeId: this.storeId }
      ),
      complete: () => {
        this._messageNavigating = false
      },
    })
  },

  onEditStore() {
    wx.navigateTo({ url: '/packageMerchant/pages/store/edit/index' })
  },
})
