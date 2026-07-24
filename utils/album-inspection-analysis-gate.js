/**
 * 相册 AI 分析 · 入口门槛与是否可发起
 * 规则：仅完工后可见；成功分析 1 次后不可再发起（失败可重试）
 */
const { SERVICE_ALBUM_REPAIR_DONE_STATUSES } = require('../constants/service-album-status')

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

/** 仅已完工相册展示入口 */
function shouldShowAiAnalysisEntry(detail = {}) {
  return isAlbumCompleted(detail)
}

function findLatestSuccessfulReport(reportItems = []) {
  const sorted = [...reportItems].sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
  )
  return sorted.find((row) => isSuccessfulReport(row)) || null
}

/** 完工后且尚无成功报告时可发起 */
function shouldRunAiAnalysis(detail = {}, reportItems = []) {
  if (!shouldShowAiAnalysisEntry(detail)) return false
  return !findLatestSuccessfulReport(reportItems)
}

module.exports = {
  isAlbumCompleted,
  shouldShowAiAnalysisEntry,
  shouldRunAiAnalysis,
  findLatestSuccessfulReport,
  isSuccessfulReport,
}
