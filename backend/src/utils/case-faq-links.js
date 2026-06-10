/**
 * 案例 FAQ：运营手动挂载公众号文章（title + mp.weixin.qq.com 链接）
 * 不再使用模板自动生成 q/a 短问答。
 */

const MAX_FAQ_LINKS = 10

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
    const title = normalizeString(entry.title)
    const url = normalizeString(entry.url)
    if (!title && !url) continue
    if (options.strict && (!title || !url)) {
      const err = new Error('每条 FAQ 须同时填写标题与公众号链接')
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

function hasCaseFaqLinks(faq) {
  return normalizeCaseFaqLinks(faq).length > 0
}

module.exports = {
  MAX_FAQ_LINKS,
  isWechatMpUrl,
  normalizeCaseFaqLinks,
  hasCaseFaqLinks,
}
