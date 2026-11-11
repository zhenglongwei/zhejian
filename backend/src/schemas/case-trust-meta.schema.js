/**
 * GEO-TRUST-01 · 案例 trustMeta 契约（提炼层，不改快照）
 */
const { toIso } = require('../lib/ids')

const AUTHORIZATION_TIERS = ['user_authorized', 'merchant_history', 'merchant_published']
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
  if (value === 'private' || value === 'merchant_history') {
    return {
      authorizationTier: 'merchant_history',
      authorizationTierLabel: '商家历史案例',
    }
  }
  if (value === 'merchant_published') {
    return {
      authorizationTier: 'merchant_published',
      authorizationTierLabel: '门店发布',
    }
  }
  return {
    authorizationTier: 'user_authorized',
    authorizationTierLabel: '已发布',
  }
}

function formatTrustStatement(meta) {
  const reviewedDate = meta.reviewedAt ? meta.reviewedAt.slice(0, 10) : ''
  const datePart = reviewedDate ? `，${reviewedDate}` : ''
  const disclaimer =
    '平台审核针对隐私打码与宣传合规，不代表对维修质量或配件真伪作出保证。'
  if (meta.authorizationTier === 'merchant_published') {
    return (
      `本案例为门店发布的脱敏施工记录；${disclaimer}` +
      `（快照版本 v${meta.snapshotVersion}${datePart}）。${meta.evidenceLevelLabel}。价格与方案以快照记录为准，仅供参考。`
    )
  }
  return (
    `本案例为${meta.authorizationTierLabel}；经隐私脱敏与平台审核后公开（快照版本 v${meta.snapshotVersion}${datePart}）。` +
    `${meta.evidenceLevelLabel}。${disclaimer}价格与方案以快照记录为准，仅供参考。`
  )
}

/**
 * 证据分级（2026-11-11 升级）：
 * - 无画像时保持旧的纯图数口径（兜底存量链路）
 * - 有画像（单据链证据画像，utils/case-evidence-profile）时按「环节定稿 + 图证分布」判级：
 *   图文全留证 = ≥3 环定稿 且 图证覆盖 ≥2 环 且 总图 ≥4；
 *   部分留证 = 有图但未达全留证；仅文字记录 = 全案例无图
 */
function resolveEvidenceLevel(publicImageCount, profile) {
  const labelMap = {
    text_primary: '仅文字记录',
    partial_images: '部分留证',
    rich_images: '图文全留证',
  }
  const withLabel = (level) => ({ evidenceLevel: level, evidenceLevelLabel: labelMap[level] })

  const p = profile && typeof profile === 'object' ? profile : null
  if (p && Number.isFinite(Number(p.totalPhotos))) {
    const photos = Math.max(Number(p.totalPhotos) || 0, Number(publicImageCount) || 0)
    if (photos <= 0) return withLabel('text_primary')
    const sealedStages = Number(p.sealedStages) || 0
    const photoStages = Number(p.photoStages) || 0
    if (photos >= 4 && photoStages >= 2 && sealedStages >= 3) return withLabel('rich_images')
    return withLabel('partial_images')
  }

  const count = Number(publicImageCount) || 0
  if (count <= 0) return withLabel('text_primary')
  if (count <= 3) return withLabel('partial_images')
  return withLabel('rich_images')
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
