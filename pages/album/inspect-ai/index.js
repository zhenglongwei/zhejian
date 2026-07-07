const { fetchServiceAlbum } = require('../../../services/service-album')
const { enrichServiceAlbumListItem } = require('../../../utils/service-album-display')
const {
  fetchAlbumInspectionReports,
  fetchAlbumInspectionAdvice,
} = require('../../../services/album-inspection')
const { buildInspectionReportListItem } = require('../../../utils/album-inspection-report-display')
const {
  AI_INSPECTION_DISCLAIMER,
  AI_INSPECTION_EVIDENCE_LIMIT_LINES,
  AI_INSPECTION_CONSENT,
} = require('../../../constants/album-evidence-guide')

function mapReports(items, options = {}) {
  const highlightReportId = options.highlightReportId || ''
  return (items || []).map((row, index) =>
    buildInspectionReportListItem(
      {
        ...row,
        payload: row.payload,
      },
      {
        expanded: highlightReportId
          ? row.reportId === highlightReportId || row.id === highlightReportId
          : index === 0,
        appendixExpanded: false,
      },
    ),
  )
}

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    albumTitle: '',
    reports: [],
    highlightReportId: '',
    aiLoading: false,
    aiDisclaimer: AI_INSPECTION_DISCLAIMER,
    aiEvidenceLimitLines: AI_INSPECTION_EVIDENCE_LIMIT_LINES,
  },

  onLoad(options) {
    this.albumId = options.albumId || ''
    this.focusStageId = options.focusStageId || options.stageId || ''
    this.triggerContext = options.triggerContext || 'inspect_page'
    this.pendingRunAi = options.runAi === '1' || options.runAi === 'true'
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '相册信息缺失' })
      return
    }
    this.loadPage()
  },

  onShow() {
    if (this.albumId && this.data.status === 'normal' && !this.data.aiLoading) {
      this.refreshReports()
    }
  },

  async refreshReports() {
    try {
      const reportRes = await fetchAlbumInspectionReports(this.albumId)
      const expandedMap = {}
      this.data.reports.forEach((row) => {
        expandedMap[row.reportId] = {
          expanded: row.expanded,
          appendixExpanded: row.appendixExpanded,
        }
      })
      const reports = mapReports(reportRes.items || []).map((row) => {
        const prev = expandedMap[row.reportId]
        if (!prev) return row
        return {
          ...row,
          expanded: prev.expanded,
          appendixExpanded: prev.appendixExpanded,
        }
      })
      this.setData({ reports })
    } catch (e) {
      // ignore background refresh errors
    }
  },

  async loadPage() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const [detail, reportRes] = await Promise.all([
        fetchServiceAlbum(this.albumId),
        fetchAlbumInspectionReports(this.albumId),
      ])
      const enriched = enrichServiceAlbumListItem({
        ...detail,
        id: detail.albumId,
      })
      const reports = mapReports(reportRes.items || [])
      this.setData({
        status: 'normal',
        albumTitle: enriched.serviceName || '服务相册',
        reports,
      })
      if (this.pendingRunAi) {
        this.pendingRunAi = false
        this.onRunAiCheck()
      }
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onRetry() {
    this.loadPage()
  },

  onToggleReport(e) {
    const reportId = e.currentTarget.dataset.id
    if (!reportId) return
    const reports = this.data.reports.map((row) =>
      row.reportId === reportId ? { ...row, expanded: !row.expanded } : row,
    )
    this.setData({ reports })
  },

  onToggleAppendix(e) {
    const reportId = e.currentTarget.dataset.id
    if (!reportId) return
    const reports = this.data.reports.map((row) =>
      row.reportId === reportId
        ? { ...row, appendixExpanded: !row.appendixExpanded }
        : row,
    )
    this.setData({ reports })
  },

  onRunAiCheck() {
    if (this.data.aiLoading) return
    wx.showModal({
      title: 'AI检查',
      content: AI_INSPECTION_CONSENT,
      confirmText: '继续',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        this.runAiAdvice()
      },
    })
  },

  async runAiAdvice() {
    this.setData({ aiLoading: true })
    wx.showLoading({ title: 'AI 分析中…', mask: true })
    try {
      const result = await fetchAlbumInspectionAdvice(this.albumId, {
        focusStageId: this.focusStageId || '',
        triggerContext: this.triggerContext || 'inspect_page',
      })
      const reportRes = await fetchAlbumInspectionReports(this.albumId)
      const highlightReportId = result.reportId || ''
      const reports = mapReports(reportRes.items || [], { highlightReportId })
      this.setData({
        reports,
        highlightReportId,
        aiLoading: false,
      })
      if (result.status === 'failed') {
        wx.showToast({
          title: result.errorMessage || 'AI 检查失败',
          icon: 'none',
          duration: 3000,
        })
      }
    } catch (e) {
      this.setData({ aiLoading: false })
      wx.showToast({ title: (e && e.message) || '请求失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },
})
