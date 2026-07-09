/**
 * CASE-MCH-03 · albums.content_optimize_draft_json 契约
 */
const { CASE_ARTICLE_GENERATION_SOURCE } = require('../constants/case-article-status')

const OPTIMIZE_STATUS = {
  READY: 'ready',
  APPLIED: 'applied',
  GENERATING: 'generating',
  FAILED: 'failed',
}

const OPTIMIZE_SOURCE = {
  RULE: 'rule',
  LLM_V1: 'llm_v1',
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeSuggestionList(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      const row = isPlainObject(item) ? item : {}
      const text = normalizeString(row.text || row.message)
      if (!text) return null
      return {
        type: normalizeString(row.type) || 'tip',
        text,
      }
    })
    .filter(Boolean)
}

function normalizeNodeNotes(value) {
  if (!isPlainObject(value)) return {}
  const out = {}
  Object.keys(value).forEach((key) => {
    const note = normalizeString(value[key])
    if (note) out[key] = note
  })
  return out
}

/**
 * @param {unknown} raw
 * @returns {object|null}
 */
function normalizeAlbumContentOptimizeDraft(raw) {
  if (!isPlainObject(raw)) return null
  const version = Number.isFinite(Number(raw.version)) ? Number(raw.version) : 0
  if (version < 1) return null

  const geo = isPlainObject(raw.geo) ? raw.geo : {}
  return {
    version,
    updatedAt: normalizeString(raw.updatedAt),
    appliedAt: normalizeString(raw.appliedAt),
    status: normalizeString(raw.status) || OPTIMIZE_STATUS.READY,
    source: normalizeString(raw.source) || OPTIMIZE_SOURCE.RULE,
    plan: normalizeString(raw.plan) || 'free',
    aiSummary: normalizeString(raw.aiSummary),
    geo: {
      faultDesc: normalizeString(geo.faultDesc),
      inspectResult: normalizeString(geo.inspectResult),
      repairPlan: normalizeString(geo.repairPlan),
      resultConfirm: normalizeString(geo.resultConfirm),
    },
    nodeNotes: normalizeNodeNotes(raw.nodeNotes),
    suggestions: normalizeSuggestionList(raw.suggestions),
    error: normalizeString(raw.error),
    generationSource:
      normalizeString(raw.generationSource) || CASE_ARTICLE_GENERATION_SOURCE.TEMPLATE,
  }
}

function extractAlbumContentOptimizeDraft(album) {
  return normalizeAlbumContentOptimizeDraft(album?.contentOptimizeDraftJson)
}

module.exports = {
  OPTIMIZE_STATUS,
  OPTIMIZE_SOURCE,
  normalizeAlbumContentOptimizeDraft,
  extractAlbumContentOptimizeDraft,
}
