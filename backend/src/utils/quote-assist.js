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

/** 换件/用料 vs 纯工时：模型 kind 优先，否则按行名粗分 */
function inferQuoteLineKind(name, note, kindRaw) {
  const kind = text(kindRaw).toLowerCase()
  if (kind === 'parts' || kind === 'part' || kind === 'material') return 'parts'
  if (kind === 'labor' || kind === 'ops' || kind === 'work') return 'labor'
  const blob = `${name}${note}`
  const laborHit = /拆检|检查费|诊断|工时|定位|四轮定位|动平衡|清洗|清洁|排气|编程|匹配|保养复位/.test(blob)
  const partsHit = /更换|换装|机油|机滤|空滤|汽滤|空调滤|滤芯|电瓶|刹车片|刹车盘|轮胎|油漆|喷漆|补漆|配件|总成|胶套|球头|支臂/.test(
    blob,
  )
  if (laborHit && !partsHit) return 'labor'
  return 'parts'
}

function lineHasMarketBand(row) {
  if (!row) return false
  if (row.kind === 'labor') return Boolean(text(row.dealer || row.indie))
  return Boolean(text(row.oem || row.brand || row.economy))
}

function parseSuggestedLines(raw) {
  const list = Array.isArray(raw) ? raw : []
  const lines = []
  list.forEach((row, index) => {
    if (!row || typeof row !== 'object') return
    const name = text(row.name || row.title)
    if (!name) return
    const note = text(row.note)
    const kind = inferQuoteLineKind(name, note, row.kind || row.lineKind || row.type)
    const oem = text(row.oem)
    const brand = text(row.brand)
    const economy = text(row.economy)
    const dealer = text(row.dealer || row.fours || row.shop4s || row.dealerBand)
    const indie = text(row.indie || row.garage || row.repairShop || row.indieBand)
    if (kind === 'labor') {
      lines.push({
        name,
        note,
        kind: 'labor',
        oem: '',
        brand: '',
        economy: '',
        dealer,
        indie,
        sortOrder: index,
      })
      return
    }
    lines.push({
      name,
      note,
      kind: 'parts',
      oem,
      brand,
      economy,
      dealer: '',
      indie: '',
      sortOrder: index,
    })
  })
  return lines.slice(0, 16)
}

function parseOwnerAsks(raw, max = 6) {
  const list = Array.isArray(raw) ? raw : []
  const out = []
  list.forEach((item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const ask = text(item.ask || item.title || item.name).slice(0, 28)
      const heard = text(item.heard).slice(0, 80)
      const ours = text(item.ours).slice(0, 80)
      const say = text(item.say || item.body || item.text).slice(0, 80)
      if (!ask && !heard && !ours && !say) return
      out.push({ title: ask, body: say, ask, heard, ours, say })
      return
    }
    const line = text(item)
    if (!line) return
    out.push({ title: line.slice(0, 28), body: '', ask: line.slice(0, 28), heard: '', ours: '', say: '' })
  })
  return out.slice(0, max)
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
    priceIssues: parseTitleBodyList(parsed.priceIssues || analysis.priceIssues, 8).map((row) => ({
      ...row,
      lineName: text(row.title),
    })),
    necessity: parseTitleBodyList(parsed.necessity || analysis.necessity, 8),
    photoPlan: parseTitleBodyList(parsed.photoPlan || analysis.photoPlan, 8),
    omissions: parseTitleBodyList(parsed.omissions || analysis.omissions, 8),
    objections: parseOwnerAsks(parsed.objections || analysis.objections, 6),
    suggestedLines,
  }
}

function quoteAssistHasContent(assist) {
  if (!assist || typeof assist !== 'object') return false
  const lines = Array.isArray(assist.suggestedLines) ? assist.suggestedLines : []
  const hasBand = lines.some((row) => lineHasMarketBand(row))
  return Boolean(
    (lines && lines.length) ||
      (assist.omissions && assist.omissions.length) ||
      (assist.objections && assist.objections.length) ||
      (assist.priceIssues && assist.priceIssues.length) ||
      (assist.photoPlan && assist.photoPlan.length) ||
      (assist.necessity && assist.necessity.length) ||
      hasBand,
  )
}

function sanitizeQuoteAssistForView(assist) {
  if (!assist || typeof assist !== 'object') return null
  const status = text(assist.status)
  if (!status) return null
  const suggestedLines = parseSuggestedLines(assist.suggestedLines)
  return {
    status,
    suggestedLines,
    omissions: Array.isArray(assist.omissions) ? assist.omissions : [],
    objections: Array.isArray(assist.objections) ? assist.objections : [],
    priceIssues: Array.isArray(assist.priceIssues) ? assist.priceIssues : [],
    necessity: Array.isArray(assist.necessity) ? assist.necessity : [],
    photoPlan: Array.isArray(assist.photoPlan) ? assist.photoPlan : [],
    waitHint: status === 'queued' || status === 'running' ? '正在出意见' : '',
    errorMessage: status === 'failed' ? text(assist.errorMessage) || '未能出意见' : '',
    updatedAt: text(assist.updatedAt),
  }
}

module.exports = {
  inferQuoteLineKind,
  lineHasMarketBand,
  parseSuggestedLines,
  parseOwnerAsks,
  parseQuoteAssistPayload,
  quoteAssistHasContent,
  sanitizeQuoteAssistForView,
}
