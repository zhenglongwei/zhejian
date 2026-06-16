/**
 * 案例 FAQ：页内问答 {q,a} 与公众号外链 {title,url} 可并存于 content_json.faq
 */

const { findGeoFaqViolation } = require('../schemas/geo-page.schema')

const MAX_FAQ_LINKS = 10
const MAX_FAQ_INLINE = 10
const MAX_INLINE_Q_LEN = 120
const MAX_INLINE_A_LEN = 500

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isWechatMpUrl(url) {
  const raw = normalizeString(url)
  if (!raw) return false
  try {
    const parsed = new URL(raw)
    return parsed.hostname === 'mp.weixin.qq.com'
  } catch {
    return false
  }
}

function isInlineFaqEntry(entry) {
  if (!entry || typeof entry !== 'object') return false
  const q = normalizeString(entry.q || entry.question)
  const a = normalizeString(entry.a || entry.answer)
  return Boolean(q || a)
}

function isLinkFaqEntry(entry) {
  if (!entry || typeof entry !== 'object') return false
  const title = normalizeString(entry.title)
  const url = normalizeString(entry.url)
  return Boolean(title || url)
}

/**
 * @param {unknown} value
 * @param {{ strict?: boolean }} [options]
 * @returns {{ q: string, a: string }[]}
 */
function normalizeCaseFaqInline(value, options = {}) {
  if (!Array.isArray(value)) {
    if (options.strict) {
      const err = new Error('页内 FAQ 须为数组')
      err.status = 400
      throw err
    }
    return []
  }

  const items = []
  for (const entry of value) {
    if (!isInlineFaqEntry(entry)) continue
    const q = normalizeString(entry.q || entry.question)
    const a = normalizeString(entry.a || entry.answer)
    if (!q && !a) continue
    if (options.strict && (!q || !a)) {
      const err = new Error('每条页内 FAQ 须同时填写问题与答案')
      err.status = 400
      throw err
    }
    if (!q || !a) continue
    if (options.strict) {
      if (q.length > MAX_INLINE_Q_LEN) {
        const err = new Error(`页内 FAQ 问题不超过 ${MAX_INLINE_Q_LEN} 字`)
        err.status = 400
        throw err
      }
      if (a.length > MAX_INLINE_A_LEN) {
        const err = new Error(`页内 FAQ 答案不超过 ${MAX_INLINE_A_LEN} 字`)
        err.status = 400
        throw err
      }
      const banned = findGeoFaqViolation(q) || findGeoFaqViolation(a)
      if (banned) {
        const err = new Error(`页内 FAQ 含不合规表述：${banned}`)
        err.status = 400
        throw err
      }
    }
    items.push({ q, a })
    if (items.length >= MAX_FAQ_INLINE) break
  }
  return items
}

/**
 * @param {unknown} value
 * @param {{ strict?: boolean }} [options]
 * @returns {{ title: string, url: string }[]}
 */
function normalizeCaseFaqLinks(value, options = {}) {
  if (!Array.isArray(value)) {
    if (options.strict) {
      const err = new Error('faq 须为数组')
      err.status = 400
      throw err
    }
    return []
  }

  const items = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      if (options.strict) {
        const err = new Error('faq 条目格式无效')
        err.status = 400
        throw err
      }
      continue
    }
    const q = normalizeString(entry.q || entry.question)
    const a = normalizeString(entry.a || entry.answer)
    if (q && a) continue
    const title = normalizeString(entry.title)
    const url = normalizeString(entry.url)
    if (!title && !url) continue
    if (options.strict && (!title || !url)) {
      const err = new Error('每条公众号 FAQ 须同时填写标题与链接')
      err.status = 400
      throw err
    }
    if (options.strict && !isWechatMpUrl(url)) {
      const err = new Error('公众号链接须为 mp.weixin.qq.com 域名')
      err.status = 400
      throw err
    }
    if (!title || !url || !isWechatMpUrl(url)) continue
    items.push({ title, url })
    if (items.length >= MAX_FAQ_LINKS) break
  }
  return items
}

/**
 * @param {unknown} value
 * @returns {{ inline: { q: string, a: string }[], links: { title: string, url: string }[] }}
 */
function partitionCaseFaq(value) {
  const inline = []
  const links = []
  if (!Array.isArray(value)) return { inline, links }

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const q = normalizeString(entry.q || entry.question)
    const a = normalizeString(entry.a || entry.answer)
    const title = normalizeString(entry.title)
    const url = normalizeString(entry.url)
    if (q && a) {
      inline.push({ q, a })
      continue
    }
    if (title && url && isWechatMpUrl(url)) {
      links.push({ title, url })
    }
  }

  return {
    inline: inline.slice(0, MAX_FAQ_INLINE),
    links: links.slice(0, MAX_FAQ_LINKS),
  }
}

/**
 * @param {unknown} value
 * @param {{ strict?: boolean }} [options]
 * @returns {Array<{ q?: string, a?: string, title?: string, url?: string }>}
 */
function mergeCaseFaqForStorage(inline, links, options = {}) {
  const inlineItems = normalizeCaseFaqInline(inline, options)
  const linkItems = normalizeCaseFaqLinks(links, options)
  return [...inlineItems, ...linkItems]
}

function hasCaseFaqLinks(faq) {
  return partitionCaseFaq(faq).links.length > 0
}

function hasCaseFaqInline(faq) {
  return partitionCaseFaq(faq).inline.length > 0
}

function hasCaseFaqContent(faq) {
  const parts = partitionCaseFaq(faq)
  return parts.inline.length > 0 || parts.links.length > 0
}

module.exports = {
  MAX_FAQ_LINKS,
  MAX_FAQ_INLINE,
  isWechatMpUrl,
  normalizeCaseFaqInline,
  normalizeCaseFaqLinks,
  partitionCaseFaq,
  mergeCaseFaqForStorage,
  hasCaseFaqLinks,
  hasCaseFaqInline,
  hasCaseFaqContent,
}
