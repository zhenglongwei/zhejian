/**
 * DS-B-01 · contentJson.geo 结构契约（与 docs/11_数据结构与状态机/06_案例文章与GEO字段映射.md 同构）
 * DS-B-03 生成、DS-B-05 读 API、DS-B-07 H5 渲染共用。
 */

const { CASE_ARTICLE_STATUS } = require('../constants/case-article-status')
const { toIso } = require('../lib/ids')
const { resolveCaseCanonicalPath } = require('../utils/case-slug')

const GEO_SECTION_KEYS = [
  'overview',
  'before',
  'inspect',
  'plan',
  'process',
  'result',
  'priceFactors',
  'storeNote',
  'tips',
]

/**
 * @typedef {Object} GeoKeyInfoItem
 * @property {string} label
 * @property {string} value
 */

/**
 * @typedef {Object} GeoSection
 * @property {string} key
 * @property {string} title
 * @property {string} content
 */

/**
 * @typedef {Object} GeoImageCaption
 * @property {number} imageIndex
 * @property {string} caption
 * @property {string} [alt]
 */

/**
 * @typedef {Object} GeoNodeNarrative
 * @property {string} nodeId
 * @property {string} nodeName
 * @property {string} description
 * @property {GeoImageCaption[]} [imageCaptions]
 */

/**
 * @typedef {Object} ContentJsonGeoBlock
 * @property {GeoKeyInfoItem[]} [keyInfo]
 * @property {string} [faultDesc]
 * @property {string} [inspectResult]
 * @property {string} [repairPlan]
 * @property {string[]} [priceFactors]
 * @property {GeoSection[]} [sections]
 * @property {GeoNodeNarrative[]} [nodeNarratives]
 * @property {string} [generationSource] template | ai | manual
 * @property {string} [generationVersion]
 * @property {boolean} [riskChecked]
 */

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => normalizeString(item)).filter(Boolean)
}

function normalizeKeyInfo(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!isPlainObject(item)) return null
      const label = normalizeString(item.label)
      const val = normalizeString(item.value)
      if (!label || !val) return null
      return { label, value: val }
    })
    .filter(Boolean)
}

function normalizeSections(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!isPlainObject(item)) return null
      const key = normalizeString(item.key)
      const title = normalizeString(item.title)
      const content = normalizeString(item.content)
      if (!key && !title) return null
      return { key, title, content }
    })
    .filter(Boolean)
}

function normalizeImageCaptions(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!isPlainObject(item)) return null
      const caption = normalizeString(item.caption)
      const alt = normalizeString(item.alt)
      const imageIndex = Number.isFinite(item.imageIndex) ? item.imageIndex : 0
      if (!caption && !alt) return null
      return { imageIndex, caption, alt }
    })
    .filter(Boolean)
}

function normalizeNodeNarratives(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!isPlainObject(item)) return null
      const nodeId = normalizeString(item.nodeId)
      const nodeName = normalizeString(item.nodeName)
      const description = normalizeString(item.description)
      if (!nodeId && !nodeName) return null
      return {
        nodeId,
        nodeName,
        description,
        imageCaptions: normalizeImageCaptions(item.imageCaptions),
      }
    })
    .filter(Boolean)
}

/**
 * 从 contentJson 提取并规范化 geo 块（不修改 nodes/faq/tags 等既有字段）
 * @param {unknown} contentJson
 * @returns {ContentJsonGeoBlock}
 */
function extractGeoBlock(contentJson) {
  if (!isPlainObject(contentJson)) return {}
  const geo = isPlainObject(contentJson.geo) ? contentJson.geo : {}
  return normalizeGeoBlock(geo)
}

/**
 * @param {unknown} geo
 * @returns {ContentJsonGeoBlock}
 */
function normalizeGeoBlock(geo) {
  if (!isPlainObject(geo)) return {}
  const block = {
    keyInfo: normalizeKeyInfo(geo.keyInfo),
    faultDesc: normalizeString(geo.faultDesc),
    inspectResult: normalizeString(geo.inspectResult),
    repairPlan: normalizeString(geo.repairPlan),
    resultConfirm: normalizeString(geo.resultConfirm),
    priceFactors: normalizeStringArray(geo.priceFactors),
    manualFields: normalizeStringArray(geo.manualFields),
    sections: normalizeSections(geo.sections),
    nodeNarratives: normalizeNodeNarratives(geo.nodeNarratives),
    generationSource: normalizeString(geo.generationSource),
    generationVersion: normalizeString(geo.generationVersion),
    riskChecked: Boolean(geo.riskChecked),
  }
  return Object.fromEntries(Object.entries(block).filter(([, v]) => {
    if (Array.isArray(v)) return v.length > 0
    if (typeof v === 'boolean') return v
    return Boolean(v)
  }))
}

/**
 * 合并 geo 块进 contentJson（保留 nodes/faq 等）
 * @param {unknown} contentJson
 * @param {ContentJsonGeoBlock} geoPatch
 */
function mergeContentJsonGeo(contentJson, geoPatch) {
  const base = isPlainObject(contentJson) ? { ...contentJson } : {}
  const prev = isPlainObject(base.geo) ? base.geo : {}
  const nextGeo = normalizeGeoBlock({ ...prev, ...geoPatch })
  if (Object.keys(nextGeo).length === 0) {
    const { geo: _removed, ...rest } = base
    return rest
  }
  return { ...base, geo: nextGeo }
}

/**
 * 读侧回落：优先顶列，再 contentJson.geo / 旧平铺字段
 * @param {object} row public_cases 行（含顶列 + contentJson）
 */
function resolveGeoReadableFields(row) {
  const content = isPlainObject(row?.contentJson) ? row.contentJson : {}
  const geo = extractGeoBlock(content)
  const keyInfo = Array.isArray(geo.keyInfo) ? geo.keyInfo : []
  const priceFactors = Array.isArray(geo.priceFactors) ? geo.priceFactors : []
  const sections = Array.isArray(geo.sections) ? geo.sections : []
  const nodeNarratives = Array.isArray(geo.nodeNarratives) ? geo.nodeNarratives : []
  return {
    aiSummary:
      normalizeString(row?.aiSummary) ||
      normalizeString(content.aiSummary) ||
      normalizeString(row?.summary),
    faultDesc: geo.faultDesc || normalizeString(content.faultDesc),
    inspectResult: geo.inspectResult || normalizeString(content.inspectResult),
    repairPlan: geo.repairPlan || normalizeString(content.repairPlan),
    priceFactors:
      priceFactors.length > 0 ? priceFactors : normalizeStringArray(content.priceFactors),
    keyInfo,
    sections,
    nodeNarratives,
    articleBody: normalizeString(row?.articleBody),
    seoTitle: normalizeString(row?.seoTitle) || normalizeString(row?.title),
    seoDescription:
      normalizeString(row?.seoDescription) || normalizeString(row?.summary),
    seoNoindex: Boolean(row?.seoNoindex),
    canonicalPath: normalizeString(row?.canonicalPath),
    slug: row?.slug ? normalizeString(row.slug) : null,
    articleStatus: normalizeString(row?.articleStatus) || 'pending',
    geo,
  }
}

const ARTICLE_READY_STATUSES = new Set([
  CASE_ARTICLE_STATUS.READY,
  CASE_ARTICLE_STATUS.PUBLISHED_H5,
  CASE_ARTICLE_STATUS.PUBLISHED_WECHAT,
  CASE_ARTICLE_STATUS.DRAFT,
])

/**
 * DS-B-05 · 案例详情 API `article` 块
 * @param {object} row public_cases 行（含顶列 + contentJson）
 */
function mapCaseArticleForApi(row) {
  const fields = resolveGeoReadableFields(row)
  const geo = fields.geo || {}
  /** 仅有 published 态但无正文时不算 hasArticle（存量须 generate-content 补跑） */
  const hasArticle = Boolean(String(fields.articleBody || '').trim())
  return {
    hasArticle,
    status: fields.articleStatus,
    version: Number.isFinite(row?.articleVersion) ? row.articleVersion : 0,
    generatedAt: row?.articleGeneratedAt ? toIso(row.articleGeneratedAt) : '',
    body: fields.articleBody,
    sections: fields.sections,
    nodeNarratives: fields.nodeNarratives,
    generationSource: geo.generationSource || '',
    generationVersion: geo.generationVersion || '',
  }
}

/**
 * DS-B-05 · 案例详情 API `seo` 块
 * @param {object} row public_cases 行（含顶列 + contentJson）
 */
function mapCaseSeoForApi(row) {
  const fields = resolveGeoReadableFields(row)
  const caseId = row?.id || ''
  return {
    title: fields.seoTitle,
    description: fields.seoDescription,
    noindex: fields.seoNoindex,
    canonicalPath: fields.slug
      ? resolveCaseCanonicalPath({ slug: fields.slug, caseId })
      : fields.canonicalPath || resolveCaseCanonicalPath({ caseId }),
    slug: fields.slug || null,
  }
}

function buildCanonicalPath(caseId, slug) {
  return resolveCaseCanonicalPath({ slug, caseId })
}

function emptyCaseArticleApi() {
  return {
    hasArticle: false,
    status: CASE_ARTICLE_STATUS.PENDING,
    version: 0,
    generatedAt: '',
    body: '',
    sections: [],
    nodeNarratives: [],
    generationSource: '',
    generationVersion: '',
  }
}

function emptyCaseSeoApi(caseId = '', slug = null) {
  return {
    title: '',
    description: '',
    noindex: false,
    canonicalPath: resolveCaseCanonicalPath({ slug, caseId }),
    slug: slug || null,
  }
}

module.exports = {
  GEO_SECTION_KEYS,
  extractGeoBlock,
  normalizeGeoBlock,
  mergeContentJsonGeo,
  resolveGeoReadableFields,
  mapCaseArticleForApi,
  mapCaseSeoForApi,
  buildCanonicalPath,
  emptyCaseArticleApi,
  emptyCaseSeoApi,
}
