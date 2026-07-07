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

function normalizeReportAdvice(payload = {}) {
  if (payload.overallOpinion) {
    return {
      overallOpinion: {
        summary: payload.overallOpinion.summary || '',
        completeness: payload.overallOpinion.completeness || '',
        missingItems: payload.overallOpinion.missingItems || [],
        potentialIssues: payload.overallOpinion.potentialIssues || [],
        recommendedActions: payload.overallOpinion.recommendedActions || [],
      },
      comparisons: payload.comparisons || [],
      photoAppendix: payload.photoAppendix || [],
      limitationNote: payload.limitationNote || '',
      partVerifyReminders: payload.partVerifyReminders || [],
    }
  }

  const suspectedIssues = (payload.suspectedIssues || []).map((item) =>
    typeof item === 'string' ? item : item.text || '',
  )

  return {
    overallOpinion: {
      summary: payload.summary || '',
      completeness: payload.processStatus || '',
      missingItems: payload.suggestedPhotos || [],
      potentialIssues: suspectedIssues.filter(Boolean),
      recommendedActions: payload.nextSteps || [],
    },
    comparisons: (payload.stageObservations || []).map((row) => ({
      title: row.stageTitle || row.stageId || '',
      process: row.observation || '',
      conclusion: row.concern || '',
    })),
    photoAppendix: [],
    limitationNote: '',
    partVerifyReminders: payload.partVerifyReminders || [],
  }
}

function buildInspectionReportListItem(row = {}, uiOptions = {}) {
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

  const base = {
    reportId: row.reportId || row.id || '',
    createdAt: row.createdAt || '',
    createdAtText: formatAlbumDateTime(row.createdAt) || '—',
    status,
    source: row.source || payload.source || '',
    focusStageId,
    focusStageTitle: resolveFocusStageTitle(focusStageId),
    expanded: Boolean(uiOptions.expanded),
    appendixExpanded: Boolean(uiOptions.appendixExpanded),
  }

  if (!payload.status && source === 'rule') {
    return {
      ...base,
      status: 'failed',
      errorTitle: '历史记录',
      errorMessage: '该记录为旧版规则引擎生成，非大模型结果，请重新发起 AI 检查。',
      advice: null,
    }
  }

  if (status === 'failed') {
    return {
      ...base,
      errorTitle: payload.errorTitle || '调用失败',
      errorMessage: payload.errorMessage || '',
      advice: null,
    }
  }

  return {
    ...base,
    errorTitle: '',
    errorMessage: '',
    advice: normalizeReportAdvice(payload),
  }
}

module.exports = {
  buildInspectionReportListItem,
  normalizeReportAdvice,
  resolveFocusStageTitle,
}
