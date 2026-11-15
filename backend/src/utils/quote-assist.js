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

/** 总称袋：不能当一条可写入报价表的项目名 */
function isUmbrellaQuoteName(name) {
  const n = text(name)
  if (!n) return true
  if (/^建议补充/.test(n)) return true
  if (/以下项目|下列项目|相关项目/.test(n)) return true
  if (/常规保养项目|保养项目$|一揽子|套餐外补充/.test(n)) return true
  if (/^补充(报价|项目|项)$/.test(n)) return true
  return false
}

function parseSuggestedLines(raw) {
  const list = Array.isArray(raw) ? raw : []
  const lines = []
  list.forEach((row, index) => {
    if (row == null) return
    // 旧 omissions 字符串 / {title,body} → 当成 name + reason
    let name = ''
    let note = ''
    let kindRaw = ''
    let oem = ''
    let brand = ''
    let economy = ''
    let dealer = ''
    let indie = ''
    let reason = ''
    let optionalRaw = null
    if (typeof row === 'string') {
      name = text(row)
    } else if (typeof row === 'object') {
      name = text(row.name || row.title || row.part)
      note = text(row.note)
      kindRaw = row.kind || row.lineKind || row.type
      oem = text(row.oem)
      brand = text(row.brand)
      economy = text(row.economy)
      dealer = text(row.dealer || row.fours || row.shop4s || row.dealerBand)
      indie = text(row.indie || row.garage || row.repairShop || row.indieBand)
      reason = text(row.reason || row.why || row.necessity || row.body || row.text || row.how).slice(
        0,
        160,
      )
      optionalRaw = row.optional
      if (row.ownerChoice === true) optionalRaw = true
    } else {
      return
    }
    if (!name || isUmbrellaQuoteName(name)) return
    const kind = inferQuoteLineKind(name, note, kindRaw)
    const optional = Boolean(
      optionalRaw === true ||
        optionalRaw === 'true' ||
        /可做可不做|可由车主选择|建议观察|先观察/.test(`${reason}${note}`),
    )
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
        reason,
        optional,
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
      reason,
      optional,
      sortOrder: index,
    })
  })
  return lines.slice(0, 16)
}

function parseOmissionLines(raw) {
  return parseSuggestedLines(raw)
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

const DISPOSITION_LABELS = {
  merge: '建议并入原报价',
  merge_addon: '本次补充报价已含该项目',
  merge_generic: '建议合并处理',
  separate: '建议单独补充报价',
  inspect: '建议先拆检/补拍再定',
}

function dispositionLabel(verdict, scope) {
  if (verdict !== 'merge') return DISPOSITION_LABELS[verdict] || ''
  if (scope === 'addon') return DISPOSITION_LABELS.merge_addon
  if (scope === 'prior') return DISPOSITION_LABELS.merge
  return DISPOSITION_LABELS.merge_generic
}

function normalizeLineName(value) {
  return text(value).replace(/\s+/g, '').toLowerCase()
}

/** 合并目标属于「本次补充报价自己的行」还是「以往报价」，决定结论措辞 */
function refineDispositionScope(disposition, context = {}) {
  if (!disposition || disposition.verdict !== 'merge') return disposition
  const target = text(disposition.target)
  if (!target) return { ...disposition, scope: '' }
  const hit = (rows) =>
    (Array.isArray(rows) ? rows : []).some((row) => {
      const name = normalizeLineName(row && (row.name || row))
      const key = normalizeLineName(target)
      if (!name || !key) return false
      return name === key || name.indexOf(key) >= 0 || key.indexOf(name) >= 0
    })
  if (hit(context.addonLines)) return { ...disposition, scope: 'addon' }
  if (hit(context.priorQuoteLines)) return { ...disposition, scope: 'prior' }
  return { ...disposition, scope: '' }
}

/** 补充报价处置结论：三选一 + 理由 */
function parseDisposition(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const verdictRaw = text(raw.verdict || raw.decision || raw.type || raw.conclusion).toLowerCase()
  let verdict = ''
  if (/merge|并入|合并|由原报价/.test(verdictRaw)) verdict = 'merge'
  else if (/inspect|拆检|补拍|检查|观察/.test(verdictRaw)) verdict = 'inspect'
  else if (/separate|单列|单独|补充|新增/.test(verdictRaw)) verdict = 'separate'
  const reason = text(raw.reason || raw.body || raw.text || raw.why).slice(0, 240)
  const target = text(raw.target || raw.line || raw.into).slice(0, 40)
  if (!verdict && !reason) return null
  const hasScope = Object.prototype.hasOwnProperty.call(raw, 'scope')
  const scope = hasScope ? text(raw.scope) : undefined
  const verdictLabel = hasScope
    ? dispositionLabel(verdict, scope)
    : DISPOSITION_LABELS[verdict] || ''
  return { verdict, verdictLabel, reason, target, ...(hasScope ? { scope } : {}) }
}

function parseQuoteAssistPayload(raw) {
  const parsed = parseReviewModelJson(raw) || {}
  const analysis = parsed.analysis && typeof parsed.analysis === 'object' ? parsed.analysis : parsed
  let suggestedLines = parseSuggestedLines(
    parsed.suggestedLines || parsed.lines || analysis.suggestedLines,
  )
  // 兼容旧模型：把 necessity 并进同名行的报价原因
  const necessity = parseTitleBodyList(parsed.necessity || analysis.necessity, 8)
  if (necessity.length) {
    suggestedLines = suggestedLines.map((row) => {
      if (text(row.reason)) return row
      const hit = necessity.find(
        (item) => text(item.title) && (text(item.title) === row.name || row.name.indexOf(text(item.title)) >= 0),
      )
      if (!hit) return row
      return { ...row, reason: text(hit.body).slice(0, 160) }
    })
  }
  return {
    summary: '',
    reportPrefill: '',
    issues: [],
    priceIssues: [],
    necessity: [],
    photoPlan: [],
    omissions: parseOmissionLines(
      parsed.omissions || parsed.supplements || analysis.omissions || analysis.supplements,
    ),
    objections: [],
    suggestedLines,
    disposition: parseDisposition(parsed.disposition || analysis.disposition),
  }
}

function quoteAssistHasContent(assist) {
  if (!assist || typeof assist !== 'object') return false
  const lines = Array.isArray(assist.suggestedLines) ? assist.suggestedLines : []
  const hasLineAdvice = lines.some(
    (row) => lineHasMarketBand(row) || text(row && row.reason) || text(row && row.name),
  )
  const hasDisposition = Boolean(assist.disposition && text(assist.disposition.reason))
  return Boolean(
    hasLineAdvice || hasDisposition || (assist.omissions && assist.omissions.length),
  )
}

function sanitizeQuoteAssistForView(assist, options = {}) {
  if (!assist || typeof assist !== 'object') return null
  const status = text(assist.status)
  if (!status) return null
  const suggestedLines = parseSuggestedLines(assist.suggestedLines)
  const fingerprint = text(assist.fingerprint)
  const contentFingerprint = text(options.contentFingerprint)
  const stale =
    Boolean(fingerprint) &&
    Boolean(contentFingerprint) &&
    fingerprint !== contentFingerprint &&
    (status === 'ready' || quoteAssistHasContent(assist))
  const waiting = status === 'queued' || status === 'running'
  return {
    status,
    fingerprint,
    stale,
    suggestedLines,
    omissions: parseOmissionLines(assist.omissions),
    disposition: parseDisposition(assist.disposition),
    objections: [],
    priceIssues: [],
    necessity: [],
    photoPlan: [],
    waitHint: waiting ? (quoteAssistHasContent(assist) ? '正在更新' : '正在出意见') : '',
    errorMessage: status === 'failed' ? text(assist.errorMessage) || '未能出意见' : '',
    updatedAt: text(assist.updatedAt),
  }
}

module.exports = {
  inferQuoteLineKind,
  lineHasMarketBand,
  isUmbrellaQuoteName,
  parseSuggestedLines,
  parseOmissionLines,
  parseDisposition,
  dispositionLabel,
  refineDispositionScope,
  parseOwnerAsks,
  parseQuoteAssistPayload,
  quoteAssistHasContent,
  sanitizeQuoteAssistForView,
}
