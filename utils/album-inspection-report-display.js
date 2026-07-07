/**
 * 相册 AI 检查报告 · 列表展示字段
 */
const { SERVICE_ALBUM_STAGES } = require('../constants/service-album-stages')
const { formatAlbumDateTime } = require('./service-album-display')

function resolveFocusStageTitle(focusStageId) {
  const id = String(focusStageId || '').trim()
  if (!id) return ''
  const stage = SERVICE_ALBUM_STAGES.find((item) => item.id === id)
  return (stage && stage.title) || id
}

function buildInspectionReportListItem(row = {}) {
  const payload = row.payload || row.payloadJson || {}
  const request = payload.request || {}
  const focusStageId = request.focusStageId || payload.focusStageId || ''
  const source = row.source || payload.source || ''

  let status = payload.status
  if (!status) {
    if (source === 'failed') status = 'failed'
    else if (source === 'rule') status = 'failed'
    else status = 'success'
  }

  if (!payload.status && source === 'rule') {
    return {
      reportId: row.reportId || row.id || '',
      createdAt: row.createdAt || '',
      createdAtText: formatAlbumDateTime(row.createdAt) || '—',
      status: 'failed',
      source,
      focusStageId,
      focusStageTitle: resolveFocusStageTitle(focusStageId),
      errorTitle: '历史记录',
      errorMessage: '该记录为旧版规则引擎生成，非大模型结果，请重新发起 AI 检查。',
      advice: null,
    }
  }

  return {
    reportId: row.reportId || row.id || '',
    createdAt: row.createdAt || '',
    createdAtText: formatAlbumDateTime(row.createdAt) || '—',
    status,
    source: row.source || payload.source || '',
    focusStageId,
    focusStageTitle: resolveFocusStageTitle(focusStageId),
    errorTitle: payload.errorTitle || (status === 'failed' ? '调用失败' : ''),
    errorMessage: payload.errorMessage || '',
    advice:
      status === 'success'
        ? {
            summary: payload.summary || '',
            processStatus: payload.processStatus || '',
            focusAreas: payload.focusAreas || [],
            stageObservations: payload.stageObservations || [],
            suspectedIssues: payload.suspectedIssues || [],
            partVerifyReminders: payload.partVerifyReminders || [],
            suggestedPhotos: payload.suggestedPhotos || [],
            nextSteps: payload.nextSteps || [],
          }
        : null,
  }
}

module.exports = {
  buildInspectionReportListItem,
  resolveFocusStageTitle,
}
