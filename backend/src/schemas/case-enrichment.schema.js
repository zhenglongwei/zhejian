/**
 * CASE-ENR-01 · public_cases.enrichment_json 提炼层契约
 * 与 contentJson.snapshot 分离；可变 GEO/SEO/FAQ，不改快照事实。
 */
const { toIso } = require('../lib/ids')
const { extractGeoBlock, normalizeGeoBlock } = require('./case-geo-content.schema')
const {
  partitionCaseFaq,
  normalizeCaseFaqInline,
  normalizeCaseFaqLinks,
} = require('../utils/case-faq-links')

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => normalizeString(item)).filter(Boolean)
}

/**
 * @param {unknown} raw
 * @returns {object|null}
 */
function normalizeCaseEnrichment(raw) {
  if (!isPlainObject(raw)) return null
  const version = Number.isFinite(Number(raw.version)) ? Number(raw.version) : 0
  if (version < 1) return null

  const geo = normalizeGeoBlock(raw.geo || {})
  const faq = normalizeCaseFaqInline(raw.faq)
  const faqLinks = normalizeCaseFaqLinks(raw.faqLinks)

  return {
    version,
    updatedAt: normalizeString(raw.updatedAt),
    aiSummary: normalizeString(raw.aiSummary),
    seoTitle: normalizeString(raw.seoTitle),
    seoDescription: normalizeString(raw.seoDescription),
    seoNoindex: Boolean(raw.seoNoindex),
    canonicalPath: normalizeString(raw.canonicalPath),
    slug: raw.slug != null && raw.slug !== '' ? normalizeString(raw.slug) : null,
    faq,
    faqLinks,
    schemaGraph: isPlainObject(raw.schemaGraph) ? raw.schemaGraph : null,
    topicMountIds: normalizeStringArray(raw.topicMountIds),
    geo,
    publishedH5At: normalizeString(raw.publishedH5At || geo.publishedH5At),
    publishedWechatAt: normalizeString(raw.publishedWechatAt || geo.publishedWechatAt),
  }
}

/**
 * @param {unknown} enrichmentJson
 * @returns {object|null}
 */
function extractEnrichmentFromRow(enrichmentJson) {
  if (!enrichmentJson) return null
  if (isPlainObject(enrichmentJson)) {
    return normalizeCaseEnrichment(enrichmentJson)
  }
  return null
}

/**
 * 从存量 public_cases 行构建 enrichment（backfill / 双写回落）
 * @param {object} row
 * @param {{ version?: number, updatedAt?: string }} [options]
 */
function buildEnrichmentFromPublicCaseRow(row, options = {}) {
  const content = isPlainObject(row?.contentJson) ? row.contentJson : {}
  const geo = extractGeoBlock(content)
  const { inline, links } = partitionCaseFaq(content.faq)
  const existing = extractEnrichmentFromRow(row?.enrichmentJson)

  const version =
    options.version ??
    existing?.version ??
    (Number.isFinite(row?.enrichmentVersion) && row.enrichmentVersion > 0
      ? row.enrichmentVersion
      : Math.max(Number(row?.articleVersion) || 0, 1))

  return normalizeCaseEnrichment({
    version,
    updatedAt:
      options.updatedAt ||
      existing?.updatedAt ||
      (row?.updatedAt ? toIso(row.updatedAt) : new Date().toISOString()),
    aiSummary: row?.aiSummary || existing?.aiSummary || row?.summary || '',
    seoTitle: row?.seoTitle || existing?.seoTitle || row?.title || '',
    seoDescription: row?.seoDescription || existing?.seoDescription || row?.summary || '',
    seoNoindex: row?.seoNoindex ?? existing?.seoNoindex ?? false,
    canonicalPath: row?.canonicalPath || existing?.canonicalPath || '',
    slug: row?.slug ?? existing?.slug ?? null,
    faq: inline.length ? inline : existing?.faq || [],
    faqLinks: links.length ? links : existing?.faqLinks || [],
    schemaGraph: existing?.schemaGraph || content.schemaGraph || null,
    topicMountIds: existing?.topicMountIds || normalizeStringArray(content.topicMountIds),
    geo: Object.keys(geo).length ? geo : existing?.geo || {},
    publishedH5At: geo.publishedH5At || existing?.publishedH5At || '',
    publishedWechatAt: geo.publishedWechatAt || existing?.publishedWechatAt || '',
  })
}

/**
 * 读侧真源：优先 enrichment_json，回落 contentJson.geo + 顶列
 * @param {object} row public_cases 行
 * @returns {object|null}
 */
function resolveCaseEnrichment(row) {
  const fromColumn = extractEnrichmentFromRow(row?.enrichmentJson)
  if (fromColumn) return fromColumn
  return buildEnrichmentFromPublicCaseRow(row)
}

/**
 * @param {object|null} enrichment
 * @param {object} patch
 * @param {{ bumpVersion?: boolean, previousVersion?: number }} [options]
 */
function mergeCaseEnrichmentPatch(enrichment, patch = {}, options = {}) {
  const base =
    enrichment ||
    normalizeCaseEnrichment({
      version: 1,
      updatedAt: new Date().toISOString(),
      geo: {},
    })
  const prevGeo = base.geo || {}
  const nextGeo = patch.geo != null ? normalizeGeoBlock({ ...prevGeo, ...patch.geo }) : prevGeo

  const merged = normalizeCaseEnrichment({
    ...base,
    ...patch,
    version: options.bumpVersion
      ? (options.previousVersion ?? base.version ?? 0) + 1
      : base.version,
    updatedAt: new Date().toISOString(),
    geo: nextGeo,
    faq: patch.faq != null ? normalizeCaseFaqInline(patch.faq) : base.faq,
    faqLinks:
      patch.faqLinks != null ? normalizeCaseFaqLinks(patch.faqLinks) : base.faqLinks,
    topicMountIds:
      patch.topicMountIds != null
        ? normalizeStringArray(patch.topicMountIds)
        : base.topicMountIds,
  })

  return merged
}

/**
 * 运营 GEO 手改 → enrichment patch（不含 snapshot 字段）
 * @param {object} payload updateAdminCaseGeoContent body
 */
function buildEnrichmentPatchFromGeoPayload(payload = {}) {
  const patch = {}
  const topKeys = ['aiSummary', 'seoTitle', 'seoDescription']
  for (const key of topKeys) {
    if (payload[key] != null) patch[key] = normalizeString(payload[key])
  }
  const geoPatch = {}
  const geoKeys = [
    'faultDesc',
    'inspectResult',
    'repairPlan',
    'resultConfirm',
    'manualFields',
    'sections',
    'nodeNarratives',
    'keyInfo',
    'priceFactors',
    'generationSource',
    'generationVersion',
    'riskChecked',
    'llmStatus',
    'llmDraft',
    'llmAdoptedAt',
    'publishedH5At',
    'publishedWechatAt',
  ]
  for (const key of geoKeys) {
    if (payload[key] != null) geoPatch[key] = payload[key]
  }
  if (Object.keys(geoPatch).length) patch.geo = geoPatch
  return patch
}

/**
 * enrichment → contentJson.geo 镜像（过渡期双写，不写 snapshot/nodes）
 * @param {object} contentJson
 * @param {object|null} enrichment
 */
function mirrorEnrichmentGeoToContentJson(contentJson, enrichment) {
  if (!enrichment?.geo) return contentJson
  const base = isPlainObject(contentJson) ? { ...contentJson } : {}
  return {
    ...base,
    geo: { ...enrichment.geo },
    faq: [
      ...(Array.isArray(enrichment.faq) ? enrichment.faq : []),
      ...(Array.isArray(enrichment.faqLinks) ? enrichment.faqLinks : []),
    ],
  }
}

module.exports = {
  normalizeCaseEnrichment,
  extractEnrichmentFromRow,
  buildEnrichmentFromPublicCaseRow,
  resolveCaseEnrichment,
  mergeCaseEnrichmentPatch,
  buildEnrichmentPatchFromGeoPayload,
  mirrorEnrichmentGeoToContentJson,
}
