const COLLAPSE_CHARS = 40

const WATCH_RESULTS = new Set(['需关注', '需留意'])
const OK_OR_RECORD_RESULTS = new Set(['状态良好', '已留证', '仅记录', '正常'])

function compactText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
}

function mediaUrl(entry) {
  if (!entry) return ''
  if (typeof entry === 'string') return entry
  return String(entry.url || entry.evidenceUrl || entry.src || '').trim()
}

function normalizeFindingImages(finding = {}) {
  const list = Array.isArray(finding.images) ? finding.images : []
  const fromList = list.map(mediaUrl).filter(Boolean)
  if (fromList.length) {
    return fromList.map((url) => ({ url }))
  }
  const single = mediaUrl(finding.url)
  return single ? [{ url: single }] : []
}

function quoteLineUrls(line = {}) {
  const list = Array.isArray(line.evidenceUrls) ? line.evidenceUrls : []
  const urls = list.concat(line.evidenceUrl || line.url || []).map(mediaUrl).filter(Boolean)
  return urls
}

function partTokens(partName = '') {
  return String(partName || '')
    .split(/[\/／、,，;；]+/)
    .map((part) => compactText(part))
    .filter((part) => part.length >= 2)
}

function findingInQuote(finding = {}, quoteLines = []) {
  const lines = Array.isArray(quoteLines) ? quoteLines : []
  if (!lines.length) return false
  const urls = new Set(normalizeFindingImages(finding).map((row) => row.url))
  const tokens = partTokens(finding.partName)
  return lines.some((line) => {
    const lineUrls = quoteLineUrls(line)
    if (lineUrls.some((url) => urls.has(url))) return true
    const hay = compactText(line.name) + compactText(line.note)
    if (!hay) return false
    return tokens.some((token) => hay.indexOf(token) >= 0)
  })
}

function ownerFindingBucket(finding = {}, quoteLines = []) {
  const result = String(finding.result || '').trim()
  const isWatch = WATCH_RESULTS.has(result)
  const isOkOrRecord = OK_OR_RECORD_RESULTS.has(result)
  const lines = Array.isArray(quoteLines) ? quoteLines : []
  const quoted = !isOkOrRecord && findingInQuote(finding, lines)
  if (quoted) return 'action'
  if (isWatch) return 'watch'
  if (isOkOrRecord) return 'ok'
  if (!lines.length) return 'action'
  return 'watch'
}

function collectPrimaryQuoteLines(docs = []) {
  const list = Array.isArray(docs) ? docs : []
  const usable = list.filter(
    (doc) =>
      doc &&
      (doc.kind === 'quote_confirm' || doc.kind === 'addon_quote_confirm') &&
      !doc.cancelled,
  )
  const primary =
    usable.find((doc) => doc.kind === 'quote_confirm' && !doc.isAddon) || usable[0]
  return Array.isArray(primary && primary.lines) ? primary.lines : []
}

function buildFindingView(finding = {}, index = 0, { includeResult = false } = {}) {
  const images = normalizeFindingImages(finding)
  const advice = String(finding.advice || '').trim()
  return {
    key: `f-${index}`,
    partName: String(finding.partName || '').trim(),
    result: includeResult ? String(finding.result || '').trim() : '',
    advice,
    adviceCollapsible: advice.length > COLLAPSE_CHARS,
    images,
    previewUrls: images.map((row) => row.url),
  }
}

function buildFindingGroups(findings = {}, options = {}) {
  const list = Array.isArray(findings) ? findings : []
  const includeResult = !options.groupForOwner
  const items = list.map((row, index) => buildFindingView(row, index, { includeResult }))
  if (!options.groupForOwner) {
    return items.length ? [{ key: 'all', title: '', items }] : []
  }
  const quoteLines = options.quoteLines || []
  const groups = [
    { key: 'action', title: '需要处理', items: [] },
    { key: 'watch', title: '建议关注', items: [] },
    { key: 'ok', title: '正常', items: [] },
  ]
  items.forEach((item, index) => {
    const bucket = ownerFindingBucket(list[index] || {}, quoteLines)
    const target = groups.find((group) => group.key === bucket) || groups[2]
    target.items.push(item)
  })
  return groups.filter((group) => group.items.length)
}

function formatLineAmount(amount) {
  const raw = String(amount == null ? '' : amount).trim()
  if (!raw) return ''
  if (/^[¥￥]/.test(raw)) return raw
  const num = Number(raw)
  if (Number.isFinite(num)) return `¥${num.toFixed(2)}`
  return `¥${raw}`
}

function stripTotalPrefix(label) {
  return String(label || '')
    .replace(/^合计\s*/, '')
    .trim()
}

function buildQuoteLinesView(lines = []) {
  return (Array.isArray(lines) ? lines : []).map((line, index) => {
    const note = String((line && line.note) || '').trim()
    const evidenceUrls = Array.isArray(line && line.evidenceUrls)
      ? line.evidenceUrls.map(mediaUrl).filter(Boolean)
      : line && line.evidenceUrl
        ? [mediaUrl(line.evidenceUrl)].filter(Boolean)
        : []
    return {
      key: `l-${index}`,
      name: String((line && line.name) || '').trim(),
      brand: String((line && line.brand) || '').trim(),
      note,
      noteCollapsible: note.length > COLLAPSE_CHARS,
      amountText: formatLineAmount(line && line.amount),
      evidenceUrls,
      evidenceUrl: evidenceUrls[0] || '',
    }
  })
}

module.exports = {
  COLLAPSE_CHARS,
  ownerFindingBucket,
  findingInQuote,
  collectPrimaryQuoteLines,
  buildFindingGroups,
  buildQuoteLinesView,
  stripTotalPrefix,
  formatLineAmount,
}
