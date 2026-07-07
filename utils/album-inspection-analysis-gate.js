/**
 * 相册 AI 分析 · 入口门槛与是否需重新调用大模型
 */
const { SERVICE_ALBUM_REPAIR_DONE_STATUSES } = require('../constants/service-album-status')
const { buildStageTimeline } = require('./album-inspection-context')
const { buildAlbumInspectionContentFingerprint } = require('./album-inspection-content-fingerprint')

const AI_ANALYSIS_MIN_STAGE_ID = 'stage_5'

function resolveReportPayload(row = {}) {
  return row.payload || row.payloadJson || {}
}

function isSuccessfulReport(row = {}) {
  const payload = resolveReportPayload(row)
  if (payload.status === 'failed') return false
  const source = row.source || payload.source || ''
  if (source === 'failed' || source === 'rule') return false
  return true
}

function isAlbumCompleted(detail = {}) {
  const status = String(detail.status || '').trim()
  return SERVICE_ALBUM_REPAIR_DONE_STATUSES.includes(status)
}

function hasStageContentForAi(detail = {}, stageId = AI_ANALYSIS_MIN_STAGE_ID) {
  const timeline = buildStageTimeline(detail)
  const stage = timeline.find((row) => row.stageId === stageId)
  return Boolean(stage && stage.filled)
}

/** 已完工相册始终展示；维修中须 stage_5 有留痕 */
function shouldShowAiAnalysisEntry(detail = {}) {
  if (isAlbumCompleted(detail)) return true
  return hasStageContentForAi(detail)
}

function findLatestSuccessfulReport(reportItems = []) {
  const sorted = [...reportItems].sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
  )
  return sorted.find((row) => isSuccessfulReport(row)) || null
}

function shouldRunAiAnalysis(detail = {}, reportItems = []) {
  if (!shouldShowAiAnalysisEntry(detail)) return false

  const lastSuccess = findLatestSuccessfulReport(reportItems)
  if (!lastSuccess) return true

  const payload = resolveReportPayload(lastSuccess)
  const currentFingerprint = buildAlbumInspectionContentFingerprint(detail)

  if (payload.contentFingerprint) {
    return currentFingerprint !== payload.contentFingerprint
  }

  const updatedAt = new Date(detail.updatedAt || 0).getTime()
  const reportAt = new Date(lastSuccess.createdAt || 0).getTime()
  if (Number.isFinite(updatedAt) && Number.isFinite(reportAt)) {
    return updatedAt > reportAt
  }
  return false
}

module.exports = {
  AI_ANALYSIS_MIN_STAGE_ID,
  isAlbumCompleted,
  hasStageContentForAi,
  shouldShowAiAnalysisEntry,
  shouldRunAiAnalysis,
  findLatestSuccessfulReport,
  isSuccessfulReport,
}
