const { fetchServiceAlbum } = require('../../../services/service-album')
const { enrichServiceAlbumListItem } = require('../../../utils/service-album-display')
const { buildAlbumInspectionView } = require('../../../utils/album-inspection-view')
const { buildInspectHeroMeta } = require('../../../utils/album-inspect-hero')
const { navigateToOwnerStoreDetail } = require('../../../utils/album-store-access')
const { fetchAlbumInspectionReports } = require('../../../services/album-inspection')
const {
  shouldRunAiAnalysis,
  shouldShowAiAnalysisEntry,
} = require('../../../utils/album-inspection-analysis-gate')
const {
  COMPLETENESS_TAB_HINT,
  METHOD_TAB_HINT,
} = require('../../../constants/album-evidence-guide')

const INSPECT_TABS = [
  { key: 'completeness', label: '完整性' },
  { key: 'method', label: '检查方法' },
]

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    albumTitle: '',
    storeName: '',
    deliverDateText: '',
    updatedAtText: '',
    linkedStoreId: '',
    showStoreLink: false,
    activeTab: 'completeness',
    inspectTabs: INSPECT_TABS,
    completenessSummary: { done: 0, total: 0, missing: 0 },
    completenessHint: COMPLETENESS_TAB_HINT,
    methodHint: METHOD_TAB_HINT,
    completenessPanels: [],
    methodSections: [],
    showPartVerifyEntry: false,
    showAiAnalysisEntry: false,
    showCompareEntry: false,
  },

  onLoad(options) {
    this.albumId = options.albumId || ''
    this.focusStageId = options.focusStageId || options.stageId || ''
    this.triggerContext = options.triggerContext || 'inspect_page'
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '相册信息缺失' })
      return
    }
    this.loadInspection()
  },

  async loadInspection() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const detail = await fetchServiceAlbum(this.albumId)
      const enriched = enrichServiceAlbumListItem({
        ...detail,
        id: detail.albumId,
      })
      const view = buildAlbumInspectionView({
        ...enriched,
        publicCaseStatus: detail.publicCaseStatus || enriched.publicCaseStatus,
      })
      const hero = buildInspectHeroMeta(detail, enriched)
      this.setData({
        status: 'normal',
        albumTitle: enriched.serviceName || '服务相册',
        storeName: hero.storeName,
        deliverDateText: hero.deliverDateText,
        updatedAtText: hero.updatedAtText,
        linkedStoreId: hero.linkedStoreId,
        showStoreLink: hero.showStoreLink,
        completenessSummary: view.completeness.summary,
        completenessPanels: view.completeness.panels,
        methodSections: view.method.sections || [],
        showPartVerifyEntry: view.showPartVerifyEntry,
        showAiAnalysisEntry: shouldShowAiAnalysisEntry(detail),
        showCompareEntry: Boolean(view.outcome && view.outcome.hasCompare),
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onTabChange(e) {
    const { key } = e.detail || {}
    if (!key || key === this.data.activeTab) return
    this.setData({ activeTab: key })
  },

  onRetry() {
    this.loadInspection()
  },

  onPreviewImage(e) {
    const { url, urls } = e.detail || {}
    this.previewImages(url, urls)
  },

  onPreviewImageTap(e) {
    const { url, urls } = e.currentTarget.dataset
    this.previewImages(url, urls)
  },

  previewImages(url, urls) {
    const list = (urls || []).filter(Boolean)
    if (!url || !list.length) return
    wx.previewImage({ current: url, urls: list })
  },

  onOpenPartVerify() {
    wx.navigateTo({ url: `/pages/album/part-verify/index?albumId=${this.albumId}` })
  },

  onOpenCompare() {
    if (!this.data.showCompareEntry) return
    wx.navigateTo({ url: `/pages/album/inspect-compare/index?albumId=${this.albumId}` })
  },

  onOpenFeedback() {
    wx.navigateTo({ url: `/pages/album/feedback/index?albumId=${this.albumId}` })
  },

  onOpenStoreDetail() {
    if (!this.data.showStoreLink) return
    navigateToOwnerStoreDetail(this.data.linkedStoreId)
  },

  async onGenerateAiAdvice() {
    if (!this.data.showAiAnalysisEntry) return
    wx.showLoading({ title: '加载中', mask: true })
    try {
      const [detail, reportRes] = await Promise.all([
        fetchServiceAlbum(this.albumId),
        fetchAlbumInspectionReports(this.albumId),
      ])
      const runAi = shouldRunAiAnalysis(detail, reportRes.items || [])
      const query = [
        `albumId=${this.albumId}`,
        this.focusStageId ? `focusStageId=${this.focusStageId}` : '',
        `triggerContext=${this.triggerContext || 'inspect_page'}`,
        runAi ? 'runAi=1' : '',
      ]
        .filter(Boolean)
        .join('&')
      wx.navigateTo({ url: `/pages/album/inspect-ai/index?${query}` })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },
})
