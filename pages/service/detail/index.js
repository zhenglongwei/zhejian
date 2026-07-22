const { fetchServiceDetail } = require('../../../services/service')
const { findStore } = require('../../../services/store')
const { isAccidentCategory } = require('../../../constants/price-mode')
const { checkAuth } = require('../../../utils/auth')
const { loadFavoriteState, toggleFavorite } = require('../../../utils/favorite-toggle')
const { openLegacyListPage } = require('../../../utils/legacy-list-nav')
const { getSubmitButtonLabel } = require('../../../utils/lead-form')
const {
  resolvePageShareContext,
  withStoreContextPath,
  getShareStoreId,
  isShareStoreIsolated,
  markShareStoreContext,
} = require('../../../utils/share-store-context')

const { DEEP_LINK_SHELL } = require('../../../constants/deep-link-detail')
const { submitServiceDetailPage } = require('../../../utils/wx-search-submit')
const { assertOwnerStoreAccess, isStoreContextIsolated, userHasBoundAlbum } = require('../../../utils/album-store-access')
const { isolateRelatedCases } = require('../../../utils/isolate-related-cases')

function buildBottomLeftActions(showCasesLink) {
  const actions = [{ key: 'call', type: 'secondary', text: '电话咨询' }]
  if (showCasesLink) {
    actions.push({ key: 'cases', type: 'ghost', text: '查看案例' })
  }
  return actions
}

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
    consultSubmitLabel: '预约到店',
    casesAnchor: 'cases-section',
    showCasesLink: false,
    bottomLeftActions: buildBottomLeftActions(false),
    isFavorited: false,
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    loginSheetBindContext: 'consult',
    pendingConsultAction: false,
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
      const preferSameStore =
        this.data.storeIsolated ||
        isShareStoreIsolated(this.pageOptions) ||
        (await userHasBoundAlbum())
      const detail = await fetchServiceDetail(this.serviceId, {
        audience: 'user',
        sameStoreOnly: preferSameStore,
      })
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
        relatedCases = await isolateRelatedCases(relatedCases, {
          storeId,
          limit: 3,
        })
      }
      const detailView = {
        ...detail,
        relatedCases,
        availableMerchants: storeIsolated ? [] : detail.availableMerchants || [],
      }
      const store = detailView.storeId ? findStore(detailView.storeId) : null
      const storePhone = (store && store.phone) || ''
      const pageTitle = detailView.name || detailView.serviceName || DEEP_LINK_SHELL.service.subtitle
      const showCasesLink = Boolean((detailView.relatedCases || []).length)
      this.setData({
        detail: detailView,
        shellSubtitle: pageTitle,
        storePhone,
        isAccident: Boolean(detailView.isAccidentService) || isAccidentCategory(detailView),
        showPriceFactors: Boolean((detailView.priceFactors || []).length),
        bookable: Boolean(detailView.bookable),
        consultSubmitLabel: getSubmitButtonLabel(detailView.priceMode, 'service'),
        showCasesLink,
        bottomLeftActions: buildBottomLeftActions(showCasesLink),
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

  onBottomLeftAction(e) {
    const { key } = e.detail
    if (key === 'call') this.onCall()
    else if (key === 'cases') this.onViewCases()
  },

  onViewCases() {
    wx.pageScrollTo({ selector: `#${this.data.casesAnchor}`, duration: 300 })
  },

  ensureConsultAuth() {
    const auth = checkAuth({ needPhone: true })
    if (!auth.ok) {
      this.setData({
        loginSheetVisible: true,
        loginSheetMode: auth.reason === 'bindPhone' ? 'bindPhone' : 'auto',
        loginSheetBindContext: 'consult',
        pendingConsultAction: true,
      })
      return false
    }
    return true
  },

  onConsultSubmit() {
    if (this._messageNavigating) return
    const { detail, bookable } = this.data
    if (!detail || !bookable) {
      wx.showToast({ title: '当前服务暂不可预约', icon: 'none' })
      return
    }
    if (!this.ensureConsultAuth()) return
    this._messageNavigating = true
    wx.navigateTo({
      url: withStoreContextPath(
        `/pages/consult/submit/index?serviceId=${detail.id}&storeId=${detail.storeId || ''}&sourcePage=service`,
        { storeId: detail.storeId }
      ),
      complete: () => {
        this._messageNavigating = false
      },
    })
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
    this.setData({
      loginSheetVisible: false,
      pendingConsultAction: false,
      pendingFavoriteToggle: false,
    })
  },

  onLoginSheetSuccess() {
    const pendingFavorite = this.data.pendingFavoriteToggle
    const pendingConsult = this.data.pendingConsultAction
    this.setData({
      loginSheetVisible: false,
      pendingFavoriteToggle: false,
      pendingConsultAction: false,
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
    if (pendingConsult) {
      this.onConsultSubmit()
      return
    }
    this.syncFavoriteState()
  },
})
