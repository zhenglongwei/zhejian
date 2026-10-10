/**
 * 报告与方案 · 建议报价解析
 * 真源：docs/04_维修过程相册/26_ §4.2.1
 */
const { parseReviewModelJson } = require('./node-ai-review-rules')

function text(value) {
  return String(value || '').trim()
}

function parseTitleBodyList(raw, max = 8) {
  const list = Array.isArray(raw) ? raw : []
  const out = []
  list.forEach((item, index) => {
    if (item && typeof item === 'object') {
      const title = text(item.title || item.part || item.name).slice(0, 20)
      const body = text(item.body || item.text || item.why || item.how).slice(0, 160)
      if (title || body) out.push({ title, body, sortOrder: index })
      return
    }
    const line = text(item)
    if (line) out.push({ title: '', body: line.slice(0, 160), sortOrder: index })
  })
  return out.slice(0, max)
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
      oem: text(row.oem),
      brand: text(row.brand),
      economy: text(row.economy),
      sortOrder: index,
    })
  })
  return lines.slice(0, 16)
}

function parseQuoteAssistPayload(raw) {
  const parsed = parseReviewModelJson(raw) || {}
  const analysis = parsed.analysis && typeof parsed.analysis === 'object' ? parsed.analysis : parsed
  const suggestedLines = parseSuggestedLines(
    parsed.suggestedLines || parsed.lines || analysis.suggestedLines,
  )
  return {
    summary: '',
    reportPrefill: '',
    issues: [],
    omissions: parseTitleBodyList(parsed.omissions || analysis.omissions, 8),
    objections: parseTitleBodyList(parsed.objections || analysis.objections, 8),
    suggestedLines,
  }
}

function quoteAssistHasContent(assist) {
  if (!assist || typeof assist !== 'object') return false
  const lines = Array.isArray(assist.suggestedLines) ? assist.suggestedLines : []
  const hasBand = lines.some((row) => text(row && (row.oem || row.brand || row.economy)))
  return Boolean(
    (lines && lines.length) ||
      (assist.omissions && assist.omissions.length) ||
      (assist.objections && assist.objections.length) ||
      hasBand,
  )
}

function sanitizeQuoteAssistForView(assist) {
  if (!assist || typeof assist !== 'object') return null
  const status = text(assist.status)
  if (!status) return null
  return {
    status,
    suggestedLines: Array.isArray(assist.suggestedLines) ? assist.suggestedLines : [],
    omissions: Array.isArray(assist.omissions) ? assist.omissions : [],
    objections: Array.isArray(assist.objections) ? assist.objections : [],
    waitHint: status === 'queued' || status === 'running' ? '正在出意见' : '',
    errorMessage: status === 'failed' ? text(assist.errorMessage) || '未能出意见' : '',
    updatedAt: text(assist.updatedAt),
  }
}

module.exports = {
  parseSuggestedLines,
  parseQuoteAssistPayload,
  quoteAssistHasContent,
  sanitizeQuoteAssistForView,
}
