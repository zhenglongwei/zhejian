/**
 * DS-D-01 / DS-D-03 · 公众号案例文章导出（与 H5 case-render 同源字段）
 * 文末转化仅链本店 H5（案例页 + 门店主页），不含小程序/第三方导流。
 */
const { resolvePublicCaseMediaUrl, resolveDisplayMediaUrl } = require('../lib/media-url')

const COPY = {
  leadLabel: '案例摘要',
  processTitle: '维修过程图集',
  desensitize: '公开展示仅使用脱敏图片，不含车牌、手机号等隐私信息。',
  disclaimer:
    '本内容由商家自行发布或经车主授权展示，仅供参考。实际方案与费用请与门店线下确认，不构成线上报价或维修承诺。',
  ctaTitle: '咨询本店',
  ctaHint: '线上咨询仅为预约沟通，实际方案与费用需到店确认。',
  priceFactorsTitle: '影响价格的因素',
  faqTitle: '常见问题',
  keyInfoTitle: '关键信息',
}

const STYLE = {
  section: 'margin:24px 0;',
  h2: 'font-size:18px;font-weight:600;margin:0 0 12px;color:#1a1a1a;',
  h3: 'font-size:16px;font-weight:600;margin:16px 0 8px;color:#1a1a1a;',
  p: 'font-size:15px;line-height:1.75;color:#333;margin:0 0 12px;',
  leadLabel: 'font-size:13px;color:#666;margin:0 0 8px;',
  caption: 'font-size:13px;color:#666;margin:8px 0 0;text-align:center;',
  compliance: 'font-size:13px;color:#888;margin:0 0 12px;',
  ctaBox: 'margin:32px 0 0;padding:20px 0;border-top:1px solid #e8e8e8;',
  ctaLink: 'color:#2f6fed;text-decoration:none;',
  table: 'width:100%;border-collapse:collapse;font-size:14px;margin:12px 0;',
  th: 'text-align:left;padding:8px 12px;background:#f5f5f5;color:#666;font-weight:500;',
  td: 'padding:8px 12px;border-top:1px solid #eee;color:#333;',
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeMd(text) {
  return String(text || '').replace(/\|/g, '\\|')
}

function absolutePublicUrl(urlOrPath, publicBaseUrl) {
  const base = String(publicBaseUrl || '').replace(/\/$/, '')
  const value = String(urlOrPath || '').trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('/')) return `${base}${value}`
  return `${base}/${value}`
}

function resolveExportImageUrl(url, publicBaseUrl) {
  const sanitized = resolvePublicCaseMediaUrl(url) || resolveDisplayMediaUrl(url)
  if (!sanitized) return ''
  return absolutePublicUrl(sanitized, publicBaseUrl)
}

function getArticleSections(data) {
  if (data.article && Array.isArray(data.article.sections) && data.article.sections.length) {
    return data.article.sections
  }
  return []
}

function buildNodeNarrativeMap(data) {
  const map = {}
  const list = (data.article && data.article.nodeNarratives) || []
  list.forEach((item) => {
    if (item && item.nodeId) map[item.nodeId] = item
  })
  return map
}

function appendUtm(url, source = 'wechat_mp') {
  if (!url) return ''
  const join = url.includes('?') ? '&' : '?'
  return `${url}${join}utm_source=${encodeURIComponent(source)}`
}

function buildStoreH5Url(storeId, publicBaseUrl) {
  if (!storeId) return ''
  return absolutePublicUrl(`/store/${encodeURIComponent(storeId)}.html`, publicBaseUrl)
}

function buildCaseH5Url(data, publicBaseUrl) {
  if (data.h5Url) return data.h5Url
  const slug = data.slug || (data.seo && data.seo.slug)
  const caseId = data.id || data.caseId
  if (slug) {
    return absolutePublicUrl(`/case/${encodeURIComponent(slug)}.html`, publicBaseUrl)
  }
  if (caseId) {
    return absolutePublicUrl(`/case/view.html?id=${encodeURIComponent(caseId)}`, publicBaseUrl)
  }
  return ''
}

function formatPriceLine(data) {
  if (data.priceMode === 'appointment') return '价格：到店检测后确认'
  if (data.priceMode === 'accident') return '价格：事故车需到店检测评估'
  const min = data.minAmount != null ? Number(data.minAmount) : null
  const max = data.maxAmount != null ? Number(data.maxAmount) : null
  if (min != null && max != null && Number.isFinite(min) && Number.isFinite(max)) {
    if (min === max) return `参考价格：¥${min}（仅供参考，以到店检测为准）`
    return `参考价格：¥${min} - ¥${max}（仅供参考，以到店检测为准）`
  }
  if (data.planAmount != null && data.planAmount !== '') {
    const plan = Number(data.planAmount)
    if (Number.isFinite(plan)) {
      return `参考价格：¥${plan}（仅供参考，以到店检测为准）`
    }
  }
  return ''
}

function renderKeyInfoHtml(data) {
  const rows = (data.keyInfo || []).filter((item) => item && item.label && item.value)
  if (!rows.length) return ''
  const body = rows
    .map(
      (item) =>
        `<tr><th style="${STYLE.th}">${escapeHtml(item.label)}</th>` +
        `<td style="${STYLE.td}">${escapeHtml(item.value)}</td></tr>`
    )
    .join('')
  return (
    `<section style="${STYLE.section}">` +
    `<h2 style="${STYLE.h2}">${COPY.keyInfoTitle}</h2>` +
    `<table style="${STYLE.table}"><tbody>${body}</tbody></table>` +
    `</section>`
  )
}

function renderKeyInfoMarkdown(data) {
  const rows = (data.keyInfo || []).filter((item) => item && item.label && item.value)
  if (!rows.length) return ''
  const lines = rows.map((item) => `| ${escapeMd(item.label)} | ${escapeMd(item.value)} |`)
  return `## ${COPY.keyInfoTitle}\n\n| 项目 | 内容 |\n| --- | --- |\n${lines.join('\n')}\n`
}

function renderSectionsHtml(data) {
  const sections = getArticleSections(data).filter(
    (section) => section && section.content && section.key !== 'priceFactors'
  )
  if (!sections.length) return ''
  return sections
    .map(
      (section) =>
        `<section style="${STYLE.section}">` +
        `<h2 style="${STYLE.h2}">${escapeHtml(section.title || '')}</h2>` +
        `<p style="${STYLE.p}">${escapeHtml(section.content).replace(/\n/g, '<br>')}</p>` +
        `</section>`
    )
    .join('')
}

function renderSectionsMarkdown(data) {
  const sections = getArticleSections(data).filter(
    (section) => section && section.content && section.key !== 'priceFactors'
  )
  if (!sections.length) return ''
  return sections
    .map((section) => `## ${section.title || ''}\n\n${section.content}\n`)
    .join('\n')
}

function renderProcessHtml(data, publicBaseUrl) {
  const nodes = data.nodes || []
  if (!nodes.length) return ''
  const narrativeMap = buildNodeNarrativeMap(data)
  const blocks = nodes
    .map((node) => {
      const images = (node.images || [])
        .map((url) => resolveExportImageUrl(url, publicBaseUrl))
        .filter(Boolean)
      if (!images.length) return ''
      const nodeId = node.id || node.nodeId || ''
      const narrative = narrativeMap[nodeId] || {}
      const title = narrative.nodeName || node.title || '维修过程'
      const desc = narrative.description || node.note || ''
      const captions = narrative.imageCaptions || []
      const imgs = images
        .map((url, index) => {
          const caption =
            (captions[index] && (captions[index].alt || captions[index].caption)) || title
          const figCaption =
            captions[index] && captions[index].caption
              ? `<figcaption style="${STYLE.caption}">${escapeHtml(captions[index].caption)}</figcaption>`
              : ''
          return (
            `<figure style="margin:16px 0;">` +
            `<img src="${escapeHtml(url)}" alt="${escapeHtml(caption)}" style="max-width:100%;height:auto;display:block;" />` +
            figCaption +
            `</figure>`
          )
        })
        .join('')
      return (
        `<article style="${STYLE.section}">` +
        `<h3 style="${STYLE.h3}">${escapeHtml(title)}</h3>` +
        (desc ? `<p style="${STYLE.p}">${escapeHtml(desc)}</p>` : '') +
        imgs +
        `</article>`
      )
    })
    .filter(Boolean)
    .join('')
  if (!blocks) return ''
  return (
    `<section style="${STYLE.section}">` +
    `<h2 style="${STYLE.h2}">${COPY.processTitle}</h2>` +
    `<p style="${STYLE.compliance}">${COPY.desensitize}</p>` +
    blocks +
    `</section>`
  )
}

function renderProcessMarkdown(data, publicBaseUrl) {
  const nodes = data.nodes || []
  if (!nodes.length) return ''
  const narrativeMap = buildNodeNarrativeMap(data)
  const parts = []
  nodes.forEach((node) => {
    const images = (node.images || [])
      .map((url) => resolveExportImageUrl(url, publicBaseUrl))
      .filter(Boolean)
    if (!images.length) return
    const nodeId = node.id || node.nodeId || ''
    const narrative = narrativeMap[nodeId] || {}
    const title = narrative.nodeName || node.title || '维修过程'
    const desc = narrative.description || node.note || ''
    parts.push(`### ${title}`)
    if (desc) parts.push('', desc)
    images.forEach((url, index) => {
      const captions = narrative.imageCaptions || []
      const alt =
        (captions[index] && (captions[index].alt || captions[index].caption)) || title
      parts.push('', `![${alt}](${url})`)
      if (captions[index] && captions[index].caption) {
        parts.push('', `*${captions[index].caption}*`)
      }
    })
    parts.push('')
  })
  if (!parts.length) return ''
  return `## ${COPY.processTitle}\n\n${COPY.desensitize}\n\n${parts.join('\n')}\n`
}

function renderPriceFactorsHtml(data) {
  const factors = data.priceFactors || []
  if (!factors.length) return ''
  const items = factors
    .map((item) => `<p style="${STYLE.p}">· ${escapeHtml(item)}</p>`)
    .join('')
  return (
    `<section style="${STYLE.section}">` +
    `<h2 style="${STYLE.h2}">${COPY.priceFactorsTitle}</h2>${items}</section>`
  )
}

function renderPriceFactorsMarkdown(data) {
  const factors = data.priceFactors || []
  if (!factors.length) return ''
  return `## ${COPY.priceFactorsTitle}\n\n${factors.map((item) => `- ${item}`).join('\n')}\n`
}

function renderFaqHtml(data) {
  const faq = data.faq || []
  if (!faq.length) return ''
  const items = faq
    .map(
      (item) =>
        `<div style="margin:0 0 16px;">` +
        `<p style="${STYLE.p}"><strong>问：</strong>${escapeHtml(item.q)}</p>` +
        `<p style="${STYLE.p}"><strong>答：</strong>${escapeHtml(item.a)}</p>` +
        `</div>`
    )
    .join('')
  return (
    `<section style="${STYLE.section}">` +
    `<h2 style="${STYLE.h2}">${COPY.faqTitle}</h2>${items}</section>`
  )
}

function renderFaqMarkdown(data) {
  const faq = data.faq || []
  if (!faq.length) return ''
  const items = faq
    .map((item) => `**问：** ${item.q}\n\n**答：** ${item.a}`)
    .join('\n\n')
  return `## ${COPY.faqTitle}\n\n${items}\n`
}

function renderConversionHtml(data, publicBaseUrl) {
  const showStore = data.showStorePublicly !== false
  const storeName = showStore ? data.storeName || '' : ''
  const storeLabel = storeName || (data.city ? `${data.city}服务门店` : '服务门店')
  const phone = data.storePhone || (data.store && data.store.phone) || ''
  const caseUrl = appendUtm(buildCaseH5Url(data, publicBaseUrl))
  const storeUrl = appendUtm(buildStoreH5Url(data.storeId, publicBaseUrl))

  let lines = [
    `<section style="${STYLE.ctaBox}">`,
    `<h2 style="${STYLE.h2}">${COPY.ctaTitle}</h2>`,
    `<p style="${STYLE.p}">向「${escapeHtml(storeLabel)}」了解更多服务信息。</p>`,
  ]
  if (phone) {
    lines.push(
      `<p style="${STYLE.p}">联系电话：${escapeHtml(phone)}（请到店前电话确认营业时间）</p>`
    )
  }
  if (storeUrl && showStore) {
    lines.push(
      `<p style="${STYLE.p}"><a href="${escapeHtml(storeUrl)}" style="${STYLE.ctaLink}">查看本店 H5 主页</a></p>`
    )
  }
  if (caseUrl) {
    lines.push(
      `<p style="${STYLE.p}"><a href="${escapeHtml(caseUrl)}" style="${STYLE.ctaLink}">在线查看完整脱敏案例</a></p>`
    )
  }
  lines.push(`<p style="${STYLE.compliance}">${COPY.ctaHint}</p>`)
  lines.push(`<p style="${STYLE.compliance}">${COPY.disclaimer}</p>`)
  lines.push('</section>')
  return lines.join('')
}

function renderConversionMarkdown(data, publicBaseUrl) {
  const showStore = data.showStorePublicly !== false
  const storeName = showStore ? data.storeName || '' : ''
  const storeLabel = storeName || (data.city ? `${data.city}服务门店` : '服务门店')
  const phone = data.storePhone || (data.store && data.store.phone) || ''
  const caseUrl = appendUtm(buildCaseH5Url(data, publicBaseUrl))
  const storeUrl = appendUtm(buildStoreH5Url(data.storeId, publicBaseUrl))

  const lines = [`## ${COPY.ctaTitle}`, '', `向「${storeLabel}」了解更多服务信息。`]
  if (phone) lines.push('', `联系电话：${phone}（请到店前电话确认营业时间）`)
  if (storeUrl && showStore) lines.push('', `[查看本店 H5 主页](${storeUrl})`)
  if (caseUrl) lines.push('', `[在线查看完整脱敏案例](${caseUrl})`)
  lines.push('', COPY.ctaHint, '', COPY.disclaimer, '')
  return lines.join('\n')
}

/**
 * @param {object} data getCaseDetail 形态
 * @param {{ publicBaseUrl: string }} options
 */
function buildWechatArticleExport(data, options = {}) {
  const publicBaseUrl = options.publicBaseUrl || ''
  const lead = data.aiSummary || data.summary || ''
  const priceLine = formatPriceLine(data)

  const leadHtml = lead
    ? `<section style="${STYLE.section}">` +
      `<p style="${STYLE.leadLabel}">${COPY.leadLabel}</p>` +
      `<p style="${STYLE.p}">${escapeHtml(lead)}</p>` +
      (priceLine ? `<p style="${STYLE.p}">${escapeHtml(priceLine)}</p>` : '') +
      `</section>`
    : priceLine
      ? `<section style="${STYLE.section}"><p style="${STYLE.p}">${escapeHtml(priceLine)}</p></section>`
      : ''

  const leadMd = lead
    ? `> **${COPY.leadLabel}**\n>\n> ${lead.replace(/\n/g, '\n> ')}\n` +
      (priceLine ? `\n${priceLine}\n` : '\n')
    : priceLine
      ? `${priceLine}\n\n`
      : ''

  const html = [
    leadHtml,
    renderKeyInfoHtml(data),
    renderSectionsHtml(data),
    renderProcessHtml(data, publicBaseUrl),
    renderPriceFactorsHtml(data),
    renderFaqHtml(data),
    renderConversionHtml(data, publicBaseUrl),
  ]
    .filter(Boolean)
    .join('\n')

  const markdown = [
    leadMd,
    renderKeyInfoMarkdown(data),
    renderSectionsMarkdown(data),
    renderProcessMarkdown(data, publicBaseUrl),
    renderPriceFactorsMarkdown(data),
    renderFaqMarkdown(data),
    renderConversionMarkdown(data, publicBaseUrl),
  ]
    .filter(Boolean)
    .join('\n')

  const title =
    (data.seo && data.seo.title) || data.seoTitle || data.title || '维修案例'
  const h5Url = appendUtm(buildCaseH5Url(data, publicBaseUrl))
  const storeUrl = appendUtm(buildStoreH5Url(data.storeId, publicBaseUrl))

  return {
    title,
    seoTitle: (data.seo && data.seo.title) || data.seoTitle || '',
    html,
    markdown,
    h5Url,
    storeUrl,
    storeName: data.storeName || '',
    storeId: data.storeId || '',
    caseId: data.id || data.caseId || '',
  }
}

module.exports = {
  COPY,
  buildWechatArticleExport,
  absolutePublicUrl,
  buildCaseH5Url,
  buildStoreH5Url,
}
