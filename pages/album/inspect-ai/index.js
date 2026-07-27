const { fetchServiceAlbum } = require('../../../services/service-album')
const { enrichServiceAlbumListItem } = require('../../../utils/service-album-display')
const {
  fetchAlbumInspectionReports,
  fetchAlbumInspectionAdvice,
} = require('../../../services/album-inspection')
const { buildInspectionReportListItem } = require('../../../utils/album-inspection-report-display')
const {
  shouldRunAiAnalysis,
  isAlbumCompleted,
  findLatestInflightReport,
} = require('../../../utils/album-inspection-analysis-gate')

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

function resolvePendingHint(reportItems = []) {
  const inflight = findLatestInflightReport(reportItems)
  if (!inflight) return ''
  const status = (inflight.payload && inflight.payload.status) || inflight.status
  if (status === 'queued') {
    return '已在排队：配图脱敏完成后将自动分析，完成后会通知你。'
  }
  if (status === 'running') {
    return '分析进行中，完成后会通知你查看。'
  }
  return ''
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
    canRunAiAnalysis: false,
    albumCompleted: false,
    pendingHint: '',
  },

  onLoad(options) {
    this.albumId = options.albumId || ''
    this.focusStageId = options.focusStageId || options.stageId || ''
    this.triggerContext = options.triggerContext || 'inspect_page'
    const highlightReportId = (options && options.highlightReportId) || ''
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '相册信息缺失' })
      return
    }
    if (highlightReportId) {
      this.setData({ highlightReportId })
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
      const [detail, reportRes] = await Promise.all([
        fetchServiceAlbum(this.albumId),
        fetchAlbumInspectionReports(this.albumId),
      ])
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
      this.setData({
        reports,
        canRunAiAnalysis: shouldRunAiAnalysis(detail, reportRes.items || []),
        albumCompleted: isAlbumCompleted(detail),
      })
      this.albumDetail = detail
      this.rawReportItems = reportRes.items || []
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
      const reports = mapReports(reportRes.items || [], {
        highlightReportId: this.data.highlightReportId || '',
      })
      const canRunAiAnalysis = shouldRunAiAnalysis(detail, reportRes.items || [])
      this.albumDetail = detail
      this.rawReportItems = reportRes.items || []
      this.setData({
        status: 'normal',
        albumTitle: enriched.serviceName || '服务相册',
        reports,
        canRunAiAnalysis,
        albumCompleted: isAlbumCompleted(detail),
        pendingHint: resolvePendingHint(reportRes.items || []),
      })
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
    if (!this.data.canRunAiAnalysis) {
      const inflight = (this.rawReportItems || []).find((row) => {
        const status = (row.payload && row.payload.status) || row.status
        return status === 'queued' || status === 'running'
      })
      let title = '相册完工后可试用 AI 分析'
      if (this.data.albumCompleted) {
        title = inflight
          ? inflight.payload && inflight.payload.status === 'queued'
            ? '已在排队，脱敏完成后自动分析'
            : '分析进行中，完成后会通知你'
          : '本相册试用已用完，请查看下方记录'
      }
      wx.showToast({
        title,
        icon: 'none',
        duration: 2500,
      })
      return
    }
    this.runAiAdvice()
  },

  async runAiAdvice() {
    this.setData({ aiLoading: true })
    wx.showLoading({ title: '提交中…', mask: true })
    try {
      const result = await fetchAlbumInspectionAdvice(this.albumId, {
        focusStageId: this.focusStageId || '',
        triggerContext: this.triggerContext || 'inspect_page',
      })
      const reportRes = await fetchAlbumInspectionReports(this.albumId)
      const highlightReportId = result.reportId || ''
      const reports = mapReports(reportRes.items || [], { highlightReportId })
      this.rawReportItems = reportRes.items || []
      const detail = this.albumDetail || {}
      this.setData({
        reports,
        highlightReportId,
        aiLoading: false,
        canRunAiAnalysis: shouldRunAiAnalysis(detail, reportRes.items || []),
        albumCompleted: isAlbumCompleted(detail),
        pendingHint: resolvePendingHint(reportRes.items || []),
      })
      if (result.status === 'queued') {
        wx.showModal({
          title: '已加入排队',
          content:
            result.errorMessage ||
            '配图脱敏处理中。脱敏完成后将自动开始 AI 分析，完成后会通知你查看。',
          showCancel: false,
          confirmText: '知道了',
        })
      } else if (result.status === 'running') {
        wx.showModal({
          title: '分析已开始',
          content: result.errorMessage || 'AI 分析进行中，完成后会通知你查看。',
          showCancel: false,
          confirmText: '知道了',
        })
      } else if (result.status === 'failed') {
        wx.showToast({
          title: result.errorMessage || 'AI 分析失败',
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
