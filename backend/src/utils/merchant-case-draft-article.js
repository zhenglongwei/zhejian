/**
 * 车主案例稿 → 可粘贴成文的图文导出（与小程序 utils/merchant-case-draft-article.js 同步）
 */

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function absoluteUrl(url, publicBaseUrl = '') {
  const value = String(url || '').trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  const base = String(publicBaseUrl || '').replace(/\/$/, '')
  if (!base) return value
  if (value.startsWith('/')) return `${base}${value}`
  return `${base}/${value}`
}

function collectSectionBodies(draft = {}) {
  return (draft.sections || [])
    .map((sec) => ({
      key: String((sec && sec.key) || ''),
      title: String((sec && sec.title) || '').trim(),
      body: String((sec && sec.body) || '').trim(),
    }))
    .filter((sec) => sec.body || sec.title)
}

function mediaBySection(draft = {}, publicBaseUrl = '') {
  const map = {}
  ;(draft.media || []).forEach((item) => {
    const url = absoluteUrl((item && (item.maskedUrl || item.displayUrl)) || '', publicBaseUrl)
    if (!url) return
    const key = String((item && item.sectionKey) || 'process')
    if (!map[key]) map[key] = []
    map[key].push({
      url,
      caption: String((item && item.caption) || '').trim(),
    })
  })
  return map
}

function buildDraftArticleExport(draft = {}, options = {}) {
  const publicBaseUrl = options.publicBaseUrl || ''
  const title = String(draft.title || '维修案例').trim() || '维修案例'
  const summary = String(draft.caseSummary || '').trim()
  const sections = collectSectionBodies(draft)
  const mediaMap = mediaBySection(draft, publicBaseUrl)

  const style = {
    wrap: 'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2329;line-height:1.75;font-size:15px;',
    h1: 'font-size:22px;font-weight:600;margin:0 0 16px;line-height:1.4;',
    h2: 'font-size:17px;font-weight:600;margin:24px 0 10px;line-height:1.4;',
    p: 'margin:0 0 12px;white-space:pre-wrap;',
    lead: 'margin:0 0 20px;padding:12px 14px;background:#f5f6f7;border-radius:8px;color:#646a73;',
    img: 'display:block;width:100%;max-width:100%;margin:10px 0 6px;border-radius:8px;',
    caption: 'font-size:13px;color:#8f959e;margin:0 0 12px;text-align:center;',
    tip: 'font-size:12px;color:#8f959e;margin:28px 0 0;',
  }

  const htmlParts = [
    `<article style="${style.wrap}">`,
    `<h1 style="${style.h1}">${escapeHtml(title)}</h1>`,
  ]
  if (summary) {
    htmlParts.push(
      `<p style="${style.lead}"><strong>案例摘要</strong><br/>${escapeHtml(summary)}</p>`,
    )
  }

  const plainParts = [title]
  if (summary) plainParts.push('', summary)

  sections.forEach((sec) => {
    const heading = sec.title || '正文'
    htmlParts.push(`<h2 style="${style.h2}">${escapeHtml(heading)}</h2>`)
    if (sec.body) {
      htmlParts.push(`<p style="${style.p}">${escapeHtml(sec.body)}</p>`)
    }
    plainParts.push('', `【${heading}】`)
    if (sec.body) plainParts.push(sec.body)

    const images = mediaMap[sec.key] || []
    images.forEach((img) => {
      htmlParts.push(
        `<img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.caption || heading)}" style="${style.img}" />`,
      )
      if (img.caption) {
        htmlParts.push(`<p style="${style.caption}">${escapeHtml(img.caption)}</p>`)
      }
      plainParts.push(`[图片] ${img.url}`)
    })
  })

  const usedKeys = new Set(sections.map((s) => s.key))
  Object.keys(mediaMap).forEach((key) => {
    if (usedKeys.has(key)) return
    const images = mediaMap[key] || []
    if (!images.length) return
    htmlParts.push(`<h2 style="${style.h2}">过程配图</h2>`)
    plainParts.push('', '【过程配图】')
    images.forEach((img) => {
      htmlParts.push(`<img src="${escapeHtml(img.url)}" alt="" style="${style.img}" />`)
      plainParts.push(`[图片] ${img.url}`)
    })
  })

  htmlParts.push(
    `<p style="${style.tip}">公开展示仅使用脱敏图片，不含车牌、手机号等隐私信息。实际方案与费用请与门店线下确认。</p>`,
  )
  htmlParts.push('</article>')

  return {
    title,
    html: htmlParts.join('\n'),
    plain: plainParts.filter((line) => line != null).join('\n'),
  }
}

module.exports = {
  escapeHtml,
  absoluteUrl,
  buildDraftArticleExport,
}
