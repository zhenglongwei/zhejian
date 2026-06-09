/**
 * DS-B-06 · 案例语义化 slug（车型 + 项目 + 城市 + caseId）
 * 真源：docs/05_H5公开网页/09_SEO页面规范.md · docs/06_平台运营后台/05_内容与SEO管理.md §6.6
 */

const { buildVehicleTitle } = require('./case-article-templates')

const CITY_ROMAN = {
  杭州: 'hangzhou',
  上海: 'shanghai',
  北京: 'beijing',
  深圳: 'shenzhen',
  广州: 'guangzhou',
  成都: 'chengdu',
  南京: 'nanjing',
  苏州: 'suzhou',
  武汉: 'wuhan',
  西安: 'xian',
  重庆: 'chongqing',
  天津: 'tianjin',
}

const BRAND_ROMAN = {
  宝马: 'bmw',
  奔驰: 'benz',
  奥迪: 'audi',
  大众: 'vw',
  丰田: 'toyota',
  本田: 'honda',
  日产: 'nissan',
  别克: 'buick',
  福特: 'ford',
  现代: 'hyundai',
  起亚: 'kia',
  特斯拉: 'tesla',
  比亚迪: 'byd',
  吉利: 'geely',
  长城: 'greatwall',
  保时捷: 'porsche',
  路虎: 'landrover',
  沃尔沃: 'volvo',
  雷克萨斯: 'lexus',
}

function simpleHash(text) {
  let hash = 0
  const value = String(text || '')
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

function normalizeAsciiSegment(text, maxLen = 48) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
}

function romanizeToken(text, map = {}) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  if (map[raw]) return map[raw]
  const ascii = normalizeAsciiSegment(raw)
  if (ascii.length >= 2) return ascii
  if (/[\u4e00-\u9fff]/.test(raw)) return `cn${simpleHash(raw).slice(0, 6)}`
  return ''
}

function romanizeVehicle(vehicle) {
  if (!vehicle || typeof vehicle !== 'object') return ''
  const brand = romanizeToken(vehicle.brand, BRAND_ROMAN)
  const series = normalizeAsciiSegment(
    String(vehicle.series || '')
      .replace(/系$/u, 'series')
      .replace(/[\u4e00-\u9fff]/g, '')
  )
  if (brand && series) return `${brand}-${series}`.replace(/-+/g, '-')
  if (brand) return brand
  const title = buildVehicleTitle(vehicle)
  const fromTitle = romanizeToken(title, BRAND_ROMAN)
  if (fromTitle && fromTitle !== 'cn') return fromTitle
  if (/[\u4e00-\u9fff]/.test(title)) return `car${simpleHash(title).slice(0, 6)}`
  return normalizeAsciiSegment(title) || 'car'
}

function romanizeServiceName(serviceName) {
  const raw = String(serviceName || '').trim()
  if (!raw) return 'repair'
  const ascii = normalizeAsciiSegment(
    raw
      .replace(/更换/g, 'replacement')
      .replace(/维修/g, 'repair')
      .replace(/保养/g, 'maintenance')
      .replace(/清洗/g, 'cleaning')
      .replace(/检测/g, 'inspection')
  )
  if (ascii.length >= 3) return ascii
  if (/[\u4e00-\u9fff]/.test(raw)) return `svc${simpleHash(raw).slice(0, 6)}`
  return 'repair'
}

/**
 * @param {{ city?: string, vehicle?: object, serviceName?: string, caseId: string }} input
 */
function buildCaseSlug(input) {
  const caseId = String(input.caseId || '').trim()
  if (!caseId) return ''

  const cityPart = romanizeToken(input.city, CITY_ROMAN) || 'city'
  const vehiclePart = romanizeVehicle(input.vehicle) || 'car'
  const servicePart = romanizeServiceName(input.serviceName)
  const idPart = normalizeAsciiSegment(caseId, 80)

  const slug = [cityPart, vehiclePart, servicePart, idPart]
    .filter(Boolean)
    .join('-')
    .replace(/-+/g, '-')
    .slice(0, 240)

  return slug || idPart
}

function buildCasePagePath(slug) {
  const value = String(slug || '').trim()
  if (!value) return ''
  return `/case/${encodeURIComponent(value)}.html`
}

function buildLegacyCaseViewPath(caseId) {
  return `/case/view.html?id=${encodeURIComponent(caseId)}`
}

function resolveCaseCanonicalPath({ slug, caseId }) {
  if (slug) return buildCasePagePath(slug)
  if (caseId) return buildLegacyCaseViewPath(caseId)
  return ''
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} slug
 * @param {string} caseId
 */
async function ensureUniqueCaseSlug(prisma, slug, caseId) {
  let candidate = slug
  let suffix = 2
  while (candidate) {
    const existing = await prisma.publicCase.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    if (!existing || existing.id === caseId) return candidate
    candidate = `${slug}-${suffix}`
    suffix += 1
    if (suffix > 20) return `${slug}-${simpleHash(caseId).slice(0, 8)}`
  }
  return slug
}

module.exports = {
  buildCaseSlug,
  buildCasePagePath,
  buildLegacyCaseViewPath,
  resolveCaseCanonicalPath,
  ensureUniqueCaseSlug,
}
