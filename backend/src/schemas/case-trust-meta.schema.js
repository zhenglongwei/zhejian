/**
 * GEO-TRUST-01 · 案例 trustMeta 契约（提炼层，不改快照）
 */
const { toIso } = require('../lib/ids')

const AUTHORIZATION_TIERS = ['user_authorized', 'merchant_history']
const EVIDENCE_LEVELS = ['text_primary', 'partial_images', 'rich_images']
const GATE_STATUSES = ['passed', 'unknown', 'pending']

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeString(value, maxLen = 0) {
  const text = String(value ?? '').trim()
  if (!maxLen || text.length <= maxLen) return text
  return text.slice(0, maxLen)
}

function normalizeIso(value) {
  if (!value) return ''
  if (value instanceof Date) return toIso(value)
  const text = normalizeString(value)
  if (!text) return ''
  const parsed = Date.parse(text)
  if (!Number.isFinite(parsed)) return text
  return new Date(parsed).toISOString()
}

/**
 * @param {unknown} raw
 * @returns {object|null}
 */
function normalizeCaseTrustMeta(raw) {
  if (!isPlainObject(raw)) return null

  const snapshotVersion = Number.isFinite(Number(raw.snapshotVersion))
    ? Number(raw.snapshotVersion)
    : 0
  if (snapshotVersion < 1) return null

  const authorizationTier = normalizeString(raw.authorizationTier)
  const evidenceLevel = normalizeString(raw.evidenceLevel)

  if (!AUTHORIZATION_TIERS.includes(authorizationTier)) return null
  if (!EVIDENCE_LEVELS.includes(evidenceLevel)) return null

  return {
    snapshotVersion,
    authorizedAt: normalizeIso(raw.authorizedAt),
    authorizationTier,
    authorizationTierLabel: normalizeString(raw.authorizationTierLabel),
    reviewStatus: normalizeString(raw.reviewStatus) || 'approved',
    reviewedAt: normalizeIso(raw.reviewedAt),
    desensitized: raw.desensitized !== false,
    evidenceLevel,
    evidenceLevelLabel: normalizeString(raw.evidenceLevelLabel),
    publicImageCount: Number.isFinite(Number(raw.publicImageCount))
      ? Math.max(0, Number(raw.publicImageCount))
      : 0,
    nodeStageCount: Number.isFinite(Number(raw.nodeStageCount))
      ? Math.max(0, Number(raw.nodeStageCount))
      : 0,
    auditLogSummary: normalizeString(raw.auditLogSummary, 120),
    complianceGateA: GATE_STATUSES.includes(normalizeString(raw.complianceGateA))
      ? normalizeString(raw.complianceGateA)
      : 'unknown',
    complianceGateB: GATE_STATUSES.includes(normalizeString(raw.complianceGateB))
      ? normalizeString(raw.complianceGateB)
      : 'passed',
    trustStatement: normalizeString(raw.trustStatement, 400),
    updatedAt: normalizeIso(raw.updatedAt) || new Date().toISOString(),
  }
}

function mapAuthorizationTierForTrust(tier) {
  const value = normalizeString(tier)
  if (value === 'private') {
    return {
      authorizationTier: 'merchant_history',
      authorizationTierLabel: '商家历史案例',
    }
  }
  return {
    authorizationTier: 'user_authorized',
    authorizationTierLabel: '用户授权案例',
  }
}

function resolveEvidenceLevel(publicImageCount) {
  const count = Number(publicImageCount) || 0
  if (count <= 0) {
    return { evidenceLevel: 'text_primary', evidenceLevelLabel: '以文字记录为主' }
  }
  if (count <= 3) {
    return { evidenceLevel: 'partial_images', evidenceLevelLabel: '含少量脱敏过程图' }
  }
  return { evidenceLevel: 'rich_images', evidenceLevelLabel: '含多阶段脱敏过程图' }
}

function formatTrustStatement(meta) {
  const reviewedDate = meta.reviewedAt ? meta.reviewedAt.slice(0, 10) : ''
  const datePart = reviewedDate ? `，${reviewedDate}` : ''
  return (
    `本案例为${meta.authorizationTierLabel}；经隐私脱敏与平台审核后公开（快照版本 v${meta.snapshotVersion}${datePart}）。` +
    `${meta.evidenceLevelLabel}。价格与方案以快照记录为准，仅供参考。`
  )
}

module.exports = {
  AUTHORIZATION_TIERS,
  EVIDENCE_LEVELS,
  GATE_STATUSES,
  normalizeCaseTrustMeta,
  mapAuthorizationTierForTrust,
  resolveEvidenceLevel,
  formatTrustStatement,
}
