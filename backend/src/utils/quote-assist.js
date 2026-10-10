/**
 * 报告与方案 · 分析稿 / 建议报价解析
 * 真源：docs/04_维修过程相册/26_ §4.2.1
 */
const { parseReviewModelJson, parseMerchantBrief, flattenBriefLine } = require('./node-ai-review-rules')

function text(value) {
  return String(value || '').trim()
}

function parseSuggestedLines(raw, { accident = false } = {}) {
  const list = Array.isArray(raw) ? raw : []
  const lines = []
  list.forEach((row, index) => {
    if (!row || typeof row !== 'object') return
    const name = text(row.name || row.title)
    if (!name) return
    const teardown = /拆检|拆解/.test(name)
    const skipBand = accident || teardown
    const oem = skipBand ? '' : text(row.oem || (row.bands && row.bands.oem))
    const brand = skipBand ? '' : text(row.brandBand || (row.bands && row.bands.brand) || '')
    const economy = skipBand ? '' : text(row.economy || (row.bands && row.bands.economy))
    lines.push({
      name,
      note: text(row.note),
      oem,
      brand,
      economy,
      sortOrder: index,
    })
  })
  return lines.slice(0, 16)
}

function parseQuoteAssistPayload(raw, ctx = {}) {
  const parsed = parseReviewModelJson(raw) || {}
  const accident = text(ctx.category) === 'accident'
  const analysis = parsed.analysis && typeof parsed.analysis === 'object' ? parsed.analysis : parsed
  const brief = parseMerchantBrief(
    {
      merchantBrief: {
        issues: analysis.issues,
        omissions: analysis.omissions,
        objections: analysis.objections,
        priceBands: accident ? [] : parsed.priceBands || analysis.priceBands,
      },
    },
    { rubric: { category: ctx.category } },
  )
  const suggestedLines = parseSuggestedLines(
    parsed.suggestedLines || parsed.lines || analysis.suggestedLines,
    { accident },
  )
  return {
    summary: text(analysis.summary || analysis.reportPrefill || '').slice(0, 800),
    reportPrefill: text(analysis.reportPrefill || analysis.summary).slice(0, 800),
    issues: brief.issues,
    omissions: brief.omissions,
    objections: brief.objections,
    suggestedLines,
  }
}

function quoteAssistHasContent(assist) {
  if (!assist || typeof assist !== 'object') return false
  return Boolean(
    text(assist.summary) ||
      text(assist.reportPrefill) ||
      (assist.issues && assist.issues.length) ||
      (assist.omissions && assist.omissions.length) ||
      (assist.objections && assist.objections.length) ||
      (assist.suggestedLines && assist.suggestedLines.length),
  )
}

function sanitizeQuoteAssistForView(assist) {
  if (!assist || typeof assist !== 'object') return null
  const status = text(assist.status)
  if (!status) return null
  const review = assist.review && typeof assist.review === 'object' ? assist.review : {}
  return {
    status,
    reviewStatus: text(review.status),
    summary: text(assist.summary),
    issues: Array.isArray(assist.issues) ? assist.issues.map(flattenBriefLine).filter(Boolean) : [],
    omissions: Array.isArray(assist.omissions) ? assist.omissions.map(flattenBriefLine).filter(Boolean) : [],
    objections: Array.isArray(assist.objections)
      ? assist.objections.map(flattenBriefLine).filter(Boolean)
      : [],
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
