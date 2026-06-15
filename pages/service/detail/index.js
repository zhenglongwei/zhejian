const { fetchServiceDetail } = require('../../../services/service')
const { findStore } = require('../../../services/store')
const { PRICE_MODE } = require('../../../constants/price-mode')
const { loadFavoriteState, toggleFavorite } = require('../../../utils/favorite-toggle')
const { openLegacyListPage } = require('../../../utils/legacy-list-nav')
const {
  resolvePageShareContext,
  filterCasesByStore,
  withStoreContextPath,
  getShareStoreId,
  isShareStoreIsolated,
  markShareStoreContext,
} = require('../../../utils/share-store-context')

const { DEEP_LINK_SHELL, buildServiceBottomLeftActions } = require('../../../constants/deep-link-detail')
const { assertOwnerStoreAccess } = require('../../../utils/album-store-access')

Page({
  data: {
    shellTitle: DEEP_LINK_SHELL.service.title,
    shellSubtitle: DEEP_LINK_SHELL.service.subtitle,
    status: 'loading',
    detail: null,
    storePhone: '',
    errorMessage: '',
    isAccident: false,
    showPriceFactors: false,
    showCasesLink: false,
    bookable: false,
    casesAnchor: 'cases-section',
    bottomLeftActions: buildServiceBottomLeftActions(false),
    isFavorited: false,
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    loginSheetBindContext: 'general',
    pendingFavoriteToggle: false,
    storeIsolated: false,
  },

  onShow() {
    if (this.data.status === 'normal' && this.serviceId) {
      this.syncFavoriteState()
    }
  },

  syncFavoriteState() {
    this.baseLeftActions = buildServiceBottomLeftActions(this.data.showCasesLink)
    return loadFavoriteState(this, {
      targetType: 'service',
      targetId: this.serviceId,
      baseLeftActions: this.baseLeftActions,
      showFavorite: true,
    })
  },

  onLoad(options) {
    this.pageOptions = options || {}
    this.serviceId = options.id || ''
    const shareCtx = resolvePageShareContext(options, {
      storeId: options.storeId || '',
      source: 'service_detail',
    })
    this.setData({ storeIsolated: shareCtx.isolated || isShareStoreIsolated(options) })
    if (!this.serviceId) {
      this.setData({ status: 'error', errorMessage: '服务不存在' })
      return
    }
    this.loadDetail()
  },

  onPullDownRefresh() {
    this.loadDetail().finally(() => wx.stopPullDownRefresh())
  },

  async loadDetail() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const detail = await fetchServiceDetail(this.serviceId, { audience: 'user' })
      const storeId = detail.storeId || getShareStoreId()
      const access = await assertOwnerStoreAccess(storeId, this.pageOptions)
      if (!access.allowed) {
        throw new Error(access.reason || '无法查看该服务')
      }
      let storeIsolated =
        this.data.storeIsolated ||
        isShareStoreIsolated() ||
        access.mode === 'album_owner' ||
        access.mode === 'context'
      if (storeId && storeIsolated) {
        markShareStoreContext({ storeId, source: 'service_detail' })
      }
      let relatedCases = detail.relatedCases || []
      if (storeIsolated && storeId) {
        relatedCases = filterCasesByStore(relatedCases, storeId)
      }
      const detailView = { ...detail, relatedCases }
      const store = detailView.storeId ? findStore(detailView.storeId) : null
      const showCasesLink =
        detail.priceMode === PRICE_MODE.ACCIDENT ||
        detail.priceMode === PRICE_MODE.RANGE ||
        detail.priceMode === PRICE_MODE.CONSULT
      this.setData({
        detail: detailView,
        storePhone: (store && store.phone) || '',
        isAccident: detailView.priceMode === PRICE_MODE.ACCIDENT,
        showPriceFactors:
          detailView.priceMode === PRICE_MODE.RANGE ||
          detailView.priceMode === PRICE_MODE.CONSULT ||
          detailView.priceMode === PRICE_MODE.ACCIDENT,
        showCasesLink,
        bookable: Boolean(detailView.bookable),
        status: 'normal',
        storeIsolated: storeIsolated && Boolean(storeId),
      })
      await this.syncFavoriteState()
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败，请重试',
      })
    }
  },

  onRetry() {
    this.loadDetail()
  },

  onCaseTap(e) {
    const caseId = e.detail && e.detail.caseId
    if (!caseId || this._caseNavigating) return
    this._caseNavigating = true
    wx.navigateTo({
      url: withStoreContextPath(`/pages/case/detail/index?id=${caseId}`, {
        storeId: getShareStoreId() || (this.data.detail && this.data.detail.storeId),
      }),
      complete: () => {
        this._caseNavigating = false
      },
    })
  },

  onViewAllCases() {
    const storeId = getShareStoreId() || (this.data.detail && this.data.detail.storeId)
    openLegacyListPage('case', storeId)
  },

  onStoreTap(e) {
    const storeId = (e.detail && e.detail.storeId) || e.currentTarget.dataset.storeId
    if (!storeId || this._storeNavigating) return
    this._storeNavigating = true
    wx.navigateTo({
      url: withStoreContextPath(`/pages/store/detail/index?id=${storeId}`, { storeId }),
      complete: () => {
        this._storeNavigating = false
      },
    })
  },

  onCall() {
    const { storePhone } = this.data
    if (!storePhone) {
      wx.showToast({ title: '暂无门店电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: storePhone })
  },

  onBottomLeftAction(e) {
    const { key } = e.detail
    if (key === 'favorite') {
      toggleFavorite(this, {
        targetType: 'service',
        targetId: this.serviceId,
        baseLeftActions: buildServiceBottomLeftActions(this.data.showCasesLink),
        showFavorite: true,
      })
      return
    }
    if (key === 'call') this.onCall()
    else if (key === 'cases') this.onViewCases()
  },

  onViewCases() {
    wx.pageScrollTo({ selector: `#${this.data.casesAnchor}`, duration: 300 })
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false, pendingFavoriteToggle: false })
  },

  onLoginSheetSuccess() {
    const pendingFavorite = this.data.pendingFavoriteToggle
    this.setData({
      loginSheetVisible: false,
      pendingFavoriteToggle: false,
    })
    if (pendingFavorite) {
      toggleFavorite(this, {
        targetType: 'service',
        targetId: this.serviceId,
        baseLeftActions: buildServiceBottomLeftActions(this.data.showCasesLink),
        showFavorite: true,
      })
      return
    }
    this.syncFavoriteState()
  },
})
