/**
 * albums.content_package_json 契约
 */
const {
  CONTENT_PACKAGE_STATUS,
  CONTENT_PACKAGE_SOURCE,
} = require('../constants/album-content-package')
const { SOCIAL_PLATFORMS } = require('../constants/album-social-platforms')

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeDraft(raw) {
  if (!isPlainObject(raw)) return null
  const title = normalizeString(raw.title)
  const body = normalizeString(raw.body || raw.content)
  const tips = normalizeString(raw.tips).slice(0, 40)
  if (!title && !body) return null
  return { title, body, tips }
}

function normalizeDrafts(raw) {
  const out = {}
  const src = isPlainObject(raw) ? raw : {}
  Object.keys(SOCIAL_PLATFORMS).forEach((platformId) => {
    const draft = normalizeDraft(src[platformId])
    if (draft) out[platformId] = draft
  })
  return out
}

function normalizeQualitySuggestions(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const row = isPlainObject(item) ? item : {}
      const message = normalizeString(row.message || row.text)
      if (!message) return null
      const level = normalizeString(row.level) || 'weak'
      return {
        field: normalizeString(row.field) || 'general',
        issue: normalizeString(row.issue) || 'llm_tip',
        message,
        level: level === 'block' ? 'block' : 'weak',
        source: 'content_package',
      }
    })
    .filter(Boolean)
    .slice(0, 12)
}

function normalizeAlbumContentPackage(raw) {
  if (!isPlainObject(raw)) return null
  const status = normalizeString(raw.status) || CONTENT_PACKAGE_STATUS.PENDING
  const allowed = new Set(Object.values(CONTENT_PACKAGE_STATUS))
  const { normalizeMerchantCaseDraft } = require('../services/merchant-case-draft.service')
  return {
    status: allowed.has(status) ? status : CONTENT_PACKAGE_STATUS.PENDING,
    source: normalizeString(raw.source) || '',
    factSummary: normalizeString(raw.factSummary).slice(0, 800),
    qualitySuggestions: normalizeQualitySuggestions(raw.qualitySuggestions),
    drafts: normalizeDrafts(raw.drafts),
    merchantCaseDraft: normalizeMerchantCaseDraft(raw.merchantCaseDraft),
    triggeredAt: normalizeString(raw.triggeredAt),
    generatedAt: normalizeString(raw.generatedAt),
    error: normalizeString(raw.error).slice(0, 500),
  }
}

function emptyGeneratingPackage(triggeredAt = new Date().toISOString()) {
  return {
    status: CONTENT_PACKAGE_STATUS.GENERATING,
    source: '',
    factSummary: '',
    qualitySuggestions: [],
    drafts: {},
    merchantCaseDraft: null,
    triggeredAt,
    generatedAt: '',
    error: '',
  }
}

function isPackageReady(pkg) {
  return (
    pkg &&
    pkg.status === CONTENT_PACKAGE_STATUS.READY &&
    pkg.drafts &&
    Object.keys(pkg.drafts).length > 0
  )
}

function isPackageGenerating(pkg) {
  return (
    pkg &&
    (pkg.status === CONTENT_PACKAGE_STATUS.GENERATING ||
      pkg.status === CONTENT_PACKAGE_STATUS.PENDING)
  )
}

function isPackageSkipped(pkg) {
  return pkg && pkg.status === CONTENT_PACKAGE_STATUS.SKIPPED
}

module.exports = {
  CONTENT_PACKAGE_STATUS,
  CONTENT_PACKAGE_SOURCE,
  normalizeAlbumContentPackage,
  emptyGeneratingPackage,
  isPackageReady,
  isPackageGenerating,
  isPackageSkipped,
}
