const { fetchCaseDetail } = require('../../../services/case')
const {
  buildPublicCaseSharePayload,
  copyPublicCaseWebLink,
} = require('../../../utils/case-share')
const { checkAuth } = require('../../../utils/auth')
const { loadFavoriteState, toggleFavorite } = require('../../../utils/favorite-toggle')
const {
  resolvePageShareContext,
  withStoreContextPath,
  getShareStoreId,
  isShareStoreIsolated,
  markShareStoreContext,
} = require('../../../utils/share-store-context')

const { submitCaseDetailPage } = require('../../../utils/wx-search-submit')
const { DEEP_LINK_SHELL } = require('../../../constants/deep-link-detail')
const { enrichCaseDetailForPage } = require('../../../utils/case-detail-display')
const { assertOwnerStoreAccess, isStoreContextIsolated, userHasBoundAlbum } = require('../../../utils/album-store-access')
const { isolateRelatedCases } = require('../../../utils/isolate-related-cases')
const { copyMerchantCaseH5Link } = require('../../../constants/h5-links')

const BOTTOM_LEFT_ACTIONS = [{ key: 'call', type: 'secondary', text: '电话咨询' }]

function buildShareCaseFromDetail(detail = {}) {
  if (!detail || !detail.id) return null
  return {
    id: detail.id,
    title: detail.title,
    serviceName: detail.serviceName,
    storeName: detail.storeName,
    coverImage: detail.coverImage,
    coverImageDesensitized: detail.coverImageDesensitized || detail.coverImage,
    nodes: detail.nodes,
  }
}

Page({
  data: {
    shellTitle: DEEP_LINK_SHELL.case.title,
    shellSubtitle: DEEP_LINK_SHELL.case.subtitle,
    status: 'loading',
    detail: null,
    errorMessage: '',
    relatedCases: [],
    faqList: [],
    showStorePublicly: true,
    bottomLeftActions: BOTTOM_LEFT_ACTIONS,
    isFavorited: false,
    shareSheetVisible: false,
    shareSheetIntent: 'publicCase',
    shareActionsDisabled: false,
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    loginSheetBindContext: 'consult',
    pendingConsultAction: false,
    pendingFavoriteToggle: false,
    storeIsolated: false,
    ownerReviews: [],
    showMerchantH5Copy: false,
  },

  onShow() {
    if (this.data.status === 'normal' && this.caseId) {
      this.syncFavoriteState()
    }
  },

  syncFavoriteState() {
    return loadFavoriteState(this, {
      targetType: 'case',
      targetId: this.caseId,
      showFavorite: true,
      injectIntoBottomBar: false,
    })
  },

  onLoad(options) {
    wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    this.pageOptions = options || {}
    this.caseId = options.id || ''
    const merchantPreview =
      options.merchantPreview === '1' || options.merchantPreview === 'true'
    const shareCtx = resolvePageShareContext(options, {
      storeId: options.storeId || '',
      source: 'case_detail',
    })
    this.setData({ storeIsolated: shareCtx.isolated || isShareStoreIsolated(options), showMerchantH5Copy: merchantPreview })
    if (!this.caseId) {
      this.setData({ status: 'error', errorMessage: '案例不存在' })
      return
    }
    this.loadDetail()
  },

  async loadDetail() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const preferSameStore =
        this.data.storeIsolated ||
        isShareStoreIsolated(this.pageOptions) ||
        (await userHasBoundAlbum())
      const rawDetail = await fetchCaseDetail(this.caseId, {
        relatedStoreOnly: preferSameStore,
      })
      const detail = enrichCaseDetailForPage(rawDetail)
      const storeId = detail.storeId || getShareStoreId()
      const access = await assertOwnerStoreAccess(storeId, this.pageOptions)
      if (!access.allowed) {
        throw new Error(access.reason || '无法查看该案例')
      }
      let storeIsolated = isStoreContextIsolated(access, this.data.storeIsolated || isShareStoreIsolated())
      if (storeId && storeIsolated) {
        markShareStoreContext({ storeId, source: 'case_detail' })
      }
      let relatedCases = detail.relatedCases || []
      if (storeIsolated && storeId) {
        relatedCases = await isolateRelatedCases(relatedCases, {
          storeId,
          excludeId: this.caseId,
          limit: 3,
        })
      }
      const pageTitle = detail.title || detail.serviceName || DEEP_LINK_SHELL.case.subtitle
      this.setData({
        detail,
        shellSubtitle: pageTitle,
        showStorePublicly: detail.showStorePublicly !== false,
        relatedCases,
        ownerReviews: detail.ownerReviews || [],
        faqList: (detail.faq || []).filter((item) => item && item.title && item.url),
        status: 'normal',
        storeIsolated: storeIsolated && Boolean(storeId),
      })
      submitCaseDetailPage(detail, { storeId })
      this.updateShareMenu(true)
      await this.syncFavoriteState()
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
      this.updateShareMenu(false)
    }
  },

  onRetry() {
    this.loadDetail()
  },

  onTopFavoriteTap() {
    toggleFavorite(this, {
      targetType: 'case',
      targetId: this.caseId,
      showFavorite: true,
      injectIntoBottomBar: false,
    })
  },

  onTopShareTap() {
    this.onOpenShareSheet()
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
      pendingConsultAction: false,
      pendingFavoriteToggle: false,
    })
    if (pendingFavorite) {
      toggleFavorite(this, {
        targetType: 'case',
        targetId: this.caseId,
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

  onOpenShareSheet() {
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
    const shareCase = buildShareCaseFromDetail(this.data.detail)
    if (!shareCase || !shareCase.id) {
      wx.showToast({ title: '案例信息缺失', icon: 'none' })
      return
    }
    try {
      await copyPublicCaseWebLink(shareCase.id, shareCase)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '复制失败', icon: 'none' })
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

  onShareAppMessage() {
    const shareCase = buildShareCaseFromDetail(this.data.detail)
    const payload = buildPublicCaseSharePayload(shareCase)
    if (payload) return payload
    return {
      title: '辙见 · 公开案例',
      path: `/pages/case/detail/index?id=${this.caseId}`,
    }
  },

  onShareTimeline() {
    const shareCase = buildShareCaseFromDetail(this.data.detail)
    const payload = buildPublicCaseSharePayload(shareCase)
    return {
      title: payload?.title || '辙见 · 公开案例',
      query: `id=${encodeURIComponent(this.caseId)}`,
    }
  },

  onCopyUrl() {
    if (this.caseId) {
      return { query: `id=${encodeURIComponent(this.caseId)}` }
    }
    return { query: '' }
  },

  onCopyMerchantH5Link() {
    const detail = this.data.detail || {}
    copyMerchantCaseH5Link({
      caseId: this.caseId,
      slug: detail.slug,
      canonicalPath: detail.canonicalPath,
    }).catch(() => {
      wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' })
    })
  },

  onPreviewDraftMedia(e) {
    const sectionKey = e.currentTarget.dataset.sectionKey
    const index = Number(e.currentTarget.dataset.index || 0)
    const draft = this.data.detail && this.data.detail.confirmedCaseDraft
    const section = ((draft && draft.sections) || []).find((s) => s.key === sectionKey)
    const urls = ((section && section.media) || []).map((m) => m.maskedUrl).filter(Boolean)
    if (!urls.length) return
    wx.previewImage({
      current: urls[index] || urls[0],
      urls,
    })
  },

  onCall() {
    const { detail } = this.data
    const phone = detail && detail.storePhone
    if (!phone) {
      wx.showToast({ title: '暂无门店电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: phone })
  },

  onBottomLeftAction(e) {
    const { key } = e.detail
    if (key === 'call') this.onCall()
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
    const { detail } = this.data
    if (!detail || !detail.storeId) {
      wx.showToast({ title: '门店信息不完整', icon: 'none' })
      return
    }
    if (!this.ensureConsultAuth()) return
    this._messageNavigating = true
    wx.navigateTo({
      url: withStoreContextPath(
        `/pages/consult/submit/index?storeId=${detail.storeId}&caseId=${detail.id}&sourcePage=case`,
        { storeId: detail.storeId }
      ),
      complete: () => {
        this._messageNavigating = false
      },
    })
  },

  onStoreTap(e) {
    if (!this.data.showStorePublicly) return
    const storeId = (e.detail && e.detail.storeId) || (this.data.detail && this.data.detail.storeId)
    if (!storeId || this._storeNavigating) return
    this._storeNavigating = true
    wx.navigateTo({
      url: withStoreContextPath(`/pages/store/detail/index?id=${storeId}`, { storeId }),
      complete: () => {
        this._storeNavigating = false
      },
    })
  },

  onRelatedCaseTap(e) {
    const caseId = e.detail && e.detail.caseId
    if (!caseId || this._relatedCaseNavigating) return
    this._relatedCaseNavigating = true
    wx.navigateTo({
      url: withStoreContextPath(`/pages/case/detail/index?id=${caseId}`, {
        storeId: getShareStoreId() || (this.data.detail && this.data.detail.storeId),
      }),
      complete: () => {
        this._relatedCaseNavigating = false
      },
    })
  },
})
