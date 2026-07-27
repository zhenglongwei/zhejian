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
      statusTagText: '历史记录',
      statusTagVariant: 'warning',
    }
  }

  if (status === 'failed') {
    return {
      ...base,
      errorTitle: payload.errorTitle || '调用失败',
      errorMessage: payload.errorMessage || '',
      advice: null,
      statusTagText: '调用失败',
      statusTagVariant: 'warning',
    }
  }

  if (status === 'queued') {
    return {
      ...base,
      errorTitle: payload.errorTitle || '排队中',
      errorMessage:
        payload.errorMessage ||
        '配图脱敏处理中，已排队。完成后将自动分析并通知你。',
      advice: null,
      statusTagText: '排队中',
      statusTagVariant: 'info',
    }
  }

  if (status === 'running') {
    return {
      ...base,
      errorTitle: payload.errorTitle || '分析中',
      errorMessage: payload.errorMessage || 'AI 分析进行中，完成后会通知你。',
      advice: null,
      statusTagText: '分析中',
      statusTagVariant: 'info',
    }
  }

  return {
    ...base,
    errorTitle: '',
    errorMessage: '',
    advice: normalizeReportAdvice(payload),
    statusTagText: '已完成',
    statusTagVariant: 'info',
  }
}

module.exports = {
  buildInspectionReportListItem,
  normalizeReportAdvice,
  resolveFocusStageTitle,
}
