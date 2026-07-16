/**
 * 专题 slug 自动生成（运营不必手填）
 */
const crypto = require('crypto')

const CITY_SLUG_MAP = {
  杭州: 'hangzhou',
  上海: 'shanghai',
  北京: 'beijing',
  深圳: 'shenzhen',
  广州: 'guangzhou',
  南京: 'nanjing',
  苏州: 'suzhou',
  成都: 'chengdu',
  武汉: 'wuhan',
  西安: 'xian',
  重庆: 'chongqing',
  天津: 'tianjin',
  宁波: 'ningbo',
  无锡: 'wuxi',
  长沙: 'changsha',
}

function sanitizeSlugPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function suggestGeoPageSlug({ title = '', city = '', keywords = [] } = {}) {
  const parts = []
  const citySlug = CITY_SLUG_MAP[String(city || '').trim()] || sanitizeSlugPart(city)
  if (citySlug) parts.push(citySlug)

  const keywordParts = (Array.isArray(keywords) ? keywords : [])
    .map((item) => sanitizeSlugPart(item))
    .filter((item) => item.length >= 2)
    .slice(0, 3)
  parts.push(...keywordParts)

  const latinFromTitle = String(title || '')
    .toLowerCase()
    .match(/[a-z0-9]+/g)
  if (latinFromTitle && latinFromTitle.length) {
    parts.push(...latinFromTitle.slice(0, 4))
  }

  let base = [...new Set(parts.filter(Boolean))].join('-')
  base = sanitizeSlugPart(base)
  if (base.length < 4) {
    const hash = crypto
      .createHash('md5')
      .update(`${title}|${city}|${Date.now()}`)
      .digest('hex')
      .slice(0, 8)
    base = base ? `${base}-${hash}` : `topic-${hash}`
  }
  return base.slice(0, 80)
}

async function ensureUniqueGeoPageSlug(prisma, preferred, excludeId = '') {
  let slug = sanitizeSlugPart(preferred) || suggestGeoPageSlug({ title: preferred })
  if (!slug) slug = `topic-${Date.now().toString(36)}`
  let candidate = slug
  let i = 2
  while (true) {
    const existing = await prisma.geoPage.findUnique({ where: { slug: candidate } })
    if (!existing || (excludeId && existing.id === excludeId)) return candidate
    candidate = `${slug}-${i}`.slice(0, 80)
    i += 1
    if (i > 50) {
      candidate = `${slug}-${crypto.randomBytes(3).toString('hex')}`
      return candidate
    }
  }
}

module.exports = {
  CITY_SLUG_MAP,
  sanitizeSlugPart,
  suggestGeoPageSlug,
  ensureUniqueGeoPageSlug,
}
