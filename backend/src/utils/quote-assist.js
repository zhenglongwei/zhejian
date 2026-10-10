/**
 * 报告与方案 · 建议报价解析
 * 真源：docs/04_维修过程相册/26_ §4.2.1
 */
const { parseReviewModelJson } = require('./node-ai-review-rules')

function text(value) {
  return String(value || '').trim()
}

function parseSuggestedLines(raw) {
  const list = Array.isArray(raw) ? raw : []
  const lines = []
  list.forEach((row, index) => {
    if (!row || typeof row !== 'object') return
    const name = text(row.name || row.title)
    if (!name) return
    lines.push({
      name,
      note: text(row.note),
      oem: '',
      brand: '',
      economy: '',
      sortOrder: index,
    })
  })
  return lines.slice(0, 16)
}

function parseQuoteAssistPayload(raw, ctx = {}) {
  const parsed = parseReviewModelJson(raw) || {}
  const analysis = parsed.analysis && typeof parsed.analysis === 'object' ? parsed.analysis : parsed
  const suggestedLines = parseSuggestedLines(
    parsed.suggestedLines || parsed.lines || analysis.suggestedLines,
  )
  return {
    summary: '',
    reportPrefill: '',
    issues: [],
    omissions: [],
    objections: [],
    suggestedLines,
  }
}

function quoteAssistHasContent(assist) {
  if (!assist || typeof assist !== 'object') return false
  return Boolean(assist.suggestedLines && assist.suggestedLines.length)
}

function sanitizeQuoteAssistForView(assist) {
  if (!assist || typeof assist !== 'object') return null
  const status = text(assist.status)
  if (!status) return null
  const review = assist.review && typeof assist.review === 'object' ? assist.review : {}
  return {
    status,
    reviewStatus: text(review.status),
    suggestedLines: Array.isArray(assist.suggestedLines) ? assist.suggestedLines : [],
    waitHint: status === 'queued' || status === 'running' ? '正在出方案' : text(review.status) === 'queued' || text(review.status) === 'running' ? '正在复查' : '',
    errorMessage: status === 'failed' ? text(assist.errorMessage) || '未能出方案' : '',
    updatedAt: text(assist.updatedAt),
  }
}

module.exports = {
  parseSuggestedLines,
  parseQuoteAssistPayload,
  quoteAssistHasContent,
  sanitizeQuoteAssistForView,
}
