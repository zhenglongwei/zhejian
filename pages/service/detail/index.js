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

const { DEEP_LINK_SHELL } = require('../../../constants/deep-link-detail')
const { submitServiceDetailPage } = require('../../../utils/wx-search-submit')
const { assertOwnerStoreAccess, isStoreContextIsolated } = require('../../../utils/album-store-access')

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
    bookable: false,
    casesAnchor: 'cases-section',
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
    return loadFavoriteState(this, {
      targetType: 'service',
      targetId: this.serviceId,
      showFavorite: true,
      injectIntoBottomBar: false,
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
      let storeIsolated = isStoreContextIsolated(access, this.data.storeIsolated || isShareStoreIsolated())
      if (storeId && storeIsolated) {
        markShareStoreContext({ storeId, source: 'service_detail' })
      }
      let relatedCases = detail.relatedCases || []
      if (storeIsolated && storeId) {
        relatedCases = filterCasesByStore(relatedCases, storeId)
      }
      const detailView = { ...detail, relatedCases }
      const store = detailView.storeId ? findStore(detailView.storeId) : null
      const storePhone = (store && store.phone) || ''
      const pageTitle = detailView.name || detailView.serviceName || DEEP_LINK_SHELL.service.subtitle
      this.setData({
        detail: detailView,
        shellSubtitle: pageTitle,
        storePhone,
        isAccident: detailView.priceMode === PRICE_MODE.ACCIDENT,
        showPriceFactors:
          detailView.priceMode === PRICE_MODE.RANGE ||
          detailView.priceMode === PRICE_MODE.CONSULT ||
          detailView.priceMode === PRICE_MODE.ACCIDENT,
        bookable: Boolean(detailView.bookable),
        status: 'normal',
        storeIsolated: storeIsolated && Boolean(storeId),
      })
      submitServiceDetailPage(detailView, { storeId: detailView.storeId })
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

  onTopFavoriteTap() {
    toggleFavorite(this, {
      targetType: 'service',
      targetId: this.serviceId,
      showFavorite: true,
      injectIntoBottomBar: false,
    })
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
        showFavorite: true,
        injectIntoBottomBar: false,
      })
      return
    }
    this.syncFavoriteState()
  },
})
