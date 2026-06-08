const { fetchCaseDetail } = require('../../../services/case')
const {
  buildPublicCaseSharePayload,
  copyPublicCaseWebLink,
} = require('../../../utils/case-share')
const { loadFavoriteState, toggleFavorite } = require('../../../utils/favorite-toggle')
const {
  resolvePageShareContext,
  filterCasesByStore,
  withStoreContextPath,
  getShareStoreId,
  isShareStoreIsolated,
  markShareStoreContext,
} = require('../../../utils/share-store-context')

const BOTTOM_LEFT_ACTIONS = [
  { key: 'share', type: 'secondary', text: '分享' },
  { key: 'call', type: 'secondary', text: '电话咨询' },
]

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
    loginSheetBindContext: 'favorite',
    pendingFavoriteToggle: false,
    storeIsolated: false,
  },

  onShow() {
    if (this.data.status === 'normal' && this.caseId) {
      this.syncFavoriteState()
    }
  },

  syncFavoriteState() {
    this.baseLeftActions = BOTTOM_LEFT_ACTIONS
    return loadFavoriteState(this, {
      targetType: 'case',
      targetId: this.caseId,
      baseLeftActions: this.baseLeftActions,
      showFavorite: true,
    })
  },

  onLoad(options) {
    wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    this.caseId = options.id || ''
    const shareCtx = resolvePageShareContext(options, {
      storeId: options.storeId || '',
      source: 'case_detail',
    })
    this.setData({ storeIsolated: shareCtx.isolated || isShareStoreIsolated(options) })
    if (!this.caseId) {
      this.setData({ status: 'error', errorMessage: '案例不存在' })
      return
    }
    this.loadDetail()
  },

  async loadDetail() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const detail = await fetchCaseDetail(this.caseId)
      const storeId = detail.storeId || getShareStoreId()
      const storeIsolated = this.data.storeIsolated || isShareStoreIsolated()
      if (storeId && storeIsolated) {
        markShareStoreContext({ storeId, source: 'case_detail' })
      }
      let relatedCases = detail.relatedCases || []
      if (storeIsolated && storeId) {
        relatedCases = filterCasesByStore(relatedCases, storeId)
      }
      this.setData({
        detail,
        showStorePublicly: detail.showStorePublicly !== false,
        relatedCases,
        faqList: detail.faq || [],
        status: 'normal',
        storeIsolated: storeIsolated && Boolean(storeId),
      })
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

  onBottomLeftAction(e) {
    const { key } = e.detail
    if (key === 'favorite') {
      toggleFavorite(this, {
        targetType: 'case',
        targetId: this.caseId,
        baseLeftActions: BOTTOM_LEFT_ACTIONS,
        showFavorite: true,
      })
      return
    }
    if (key === 'call') this.onCall()
    if (key === 'share') this.onOpenShareSheet()
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false, pendingFavoriteToggle: false })
  },

  onLoginSheetSuccess() {
    const pendingFavorite = this.data.pendingFavoriteToggle
    this.setData({ loginSheetVisible: false, pendingFavoriteToggle: false })
    if (pendingFavorite) {
      toggleFavorite(this, {
        targetType: 'case',
        targetId: this.caseId,
        baseLeftActions: BOTTOM_LEFT_ACTIONS,
        showFavorite: true,
      })
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

  onCall() {
    const { detail } = this.data
    const phone = detail && detail.storePhone
    if (!phone) {
      wx.showToast({ title: '暂无门店电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: phone })
  },

  onMessage() {
    if (this._messageNavigating) return
    const { detail } = this.data
    if (!detail || !detail.storeId) {
      wx.showToast({ title: '门店信息不完整', icon: 'none' })
      return
    }
    this._messageNavigating = true
    wx.navigateTo({
      url: withStoreContextPath(`/pages/consult/submit/index?storeId=${detail.storeId}&caseId=${detail.id}&sourcePage=case`, {
        storeId: detail.storeId,
      }),
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
