/**
 * 从 OCR 全文中提取疑似配件编码（可多候选）
 */

function normalizeCode(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
}

function isLikelyNoise(code) {
  if (!code || code.length < 4) return true
  if (/^\d{8}$/.test(code)) return true
  if (/^\d{11}$/.test(code)) return true
  if (/^20\d{6}$/.test(code)) return true
  return false
}

function extractBrandFromText(text) {
  const match = String(text || '').match(
    /(?:品牌|BRAND)[:：\s]*([\u4e00-\u9fa5A-Za-z0-9·.]{2,16})/i,
  )
  return match ? match[1].trim() : ''
}

function extractPartCodeCandidates(text, imageIndex = 0) {
  const raw = String(text || '')
  if (!raw.trim()) return []

  const seen = new Set()
  const candidates = []
  const brandHint = extractBrandFromText(raw)

  const push = (partCode, snippet = '') => {
    const code = normalizeCode(partCode)
    if (isLikelyNoise(code) || seen.has(code)) return
    seen.add(code)
    candidates.push({
      partCode: code,
      partBrand: brandHint,
      imageIndex,
      snippet: String(snippet || code).trim().slice(0, 48),
    })
  }

  const labeled =
    /(?:编码|零件号|零件编号|货号|PN|Part\s*No\.?)[:：\s]*([A-Z0-9][A-Z0-9\-_/]{3,})/gi
  let match = labeled.exec(raw)
  while (match) {
    push(match[1], match[0])
    match = labeled.exec(raw)
  }

  const dashed = /\b([A-Z0-9]{2,}[-/][A-Z0-9][A-Z0-9\-_/]{2,})\b/gi
  match = dashed.exec(raw)
  while (match) {
    push(match[1], match[0])
    match = dashed.exec(raw)
  }

  const standalone = /\b([A-Z0-9]{6,24})\b/g
  match = standalone.exec(raw)
  while (match) {
    push(match[1], match[0])
    match = standalone.exec(raw)
  }

  return candidates
}

function mergeCandidateLists(lists = []) {
  const merged = []
  const seen = new Set()
  ;(lists || []).forEach((list) => {
    ;(list || []).forEach((item) => {
      const code = normalizeCode(item.partCode)
      if (!code || seen.has(code)) return
      seen.add(code)
      merged.push({ ...item, partCode: code })
    })
  })
  return merged
}

module.exports = {
  extractPartCodeCandidates,
  mergeCandidateLists,
  normalizeCode,
}
