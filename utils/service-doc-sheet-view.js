const COLLAPSE_CHARS = 40

const ATTENTION_RESULTS = new Set(['需处理', '需关注', '待处理'])
const RECORD_RESULTS = new Set(['已留证', '仅记录'])

function findingResultBucket(result) {
  const text = String(result || '').trim()
  if (ATTENTION_RESULTS.has(text)) return 'attention'
  if (RECORD_RESULTS.has(text)) return 'record'
  return 'ok'
}

function findingResultVariant(result) {
  const text = String(result || '').trim()
  if (text === '需处理' || text === '待处理') return 'danger'
  if (text === '需关注') return 'warning'
  if (text === '状态良好') return 'success'
  return 'default'
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

function buildFindingView(finding = {}, index = 0) {
  const images = normalizeFindingImages(finding)
  const advice = String(finding.advice || '').trim()
  const result = String(finding.result || '').trim()
  return {
    key: `f-${index}`,
    partName: String(finding.partName || '').trim(),
    result,
    resultVariant: findingResultVariant(result),
    advice,
    adviceCollapsible: advice.length > COLLAPSE_CHARS,
    images,
    previewUrls: images.map((row) => row.url),
  }
}

function buildFindingGroups(findings = [], { groupByResult = false } = {}) {
  const items = (Array.isArray(findings) ? findings : []).map((row, index) =>
    buildFindingView(row, index),
  )
  if (!groupByResult) {
    return items.length ? [{ key: 'all', title: '', items }] : []
  }
  const groups = [
    { key: 'attention', title: '需要留意', items: [] },
    { key: 'ok', title: '状态正常', items: [] },
    { key: 'record', title: '已留证', items: [] },
  ]
  items.forEach((item, index) => {
    const source = findings[index] || {}
    const bucket = findingResultBucket(source.result || item.result)
    const target = groups.find((group) => group.key === bucket) || groups[1]
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
  findingResultBucket,
  findingResultVariant,
  buildFindingGroups,
  buildQuoteLinesView,
  stripTotalPrefix,
  formatLineAmount,
}
