/**
 * GEO-TRUST-02 · 案例 trustMeta 生成（规则为主，禁止 LLM）
 */
const { prisma } = require('../lib/prisma')
const { toIso } = require('../lib/ids')
const { scrubPiiText } = require('../utils/scrub-pii-text')
const {
  extractSnapshotFromContentJson,
  extractPublicViewFromContentJson,
  resolveSnapshotVersion,
} = require('../schemas/case-snapshot.schema')
const {
  normalizeCaseTrustMeta,
  mapAuthorizationTierForTrust,
  resolveEvidenceLevel,
  formatTrustStatement,
} = require('../schemas/case-trust-meta.schema')
const { persistCaseEnrichment } = require('./case-enrichment.service')

function countPublicImages(contentJson, snapshot) {
  const publicView = extractPublicViewFromContentJson(contentJson)
  if (publicView?.publicMediaCount != null) {
    return Math.max(0, Number(publicView.publicMediaCount) || 0)
  }
  if (Array.isArray(publicView?.media) && publicView.media.length) {
    return publicView.media.length
  }
  if (snapshot?.nodes?.length) {
    return snapshot.nodes.reduce((sum, node) => sum + (node.images?.length || 0), 0)
  }
  return 0
}

function countNodeStages(snapshot) {
  if (!snapshot?.nodes?.length) return 0
  return snapshot.nodes.filter((node) => {
    const hasNote = Boolean(String(node.note || '').trim())
    const hasImages = Array.isArray(node.images) && node.images.length > 0
    return hasNote || hasImages
  }).length
}

function resolveAuthorizedAt({ snapshot, album, row }) {
  if (snapshot?.frozenAt) return toIso(snapshot.frozenAt)
  const auth = album?.authorization
  if (auth?.status === 'authorized' && auth.updatedAt) {
    return toIso(auth.updatedAt)
  }
  if (row?.createdAt) return toIso(row.createdAt)
  return new Date().toISOString()
}

function resolveReviewedAt({ row, reviewLogs, override }) {
  if (override) return toIso(override)
  const approveLog = (reviewLogs || []).find((log) => log.reviewAction === 'approve')
  if (approveLog?.createdAt) return toIso(approveLog.createdAt)
  if (row?.publishedAt) return toIso(row.publishedAt)
  return new Date().toISOString()
}

function buildAuditLogSummary(reviewLogs, reviewComment = '') {
  const approveLog = (reviewLogs || []).find((log) => log.reviewAction === 'approve')
  const raw = scrubPiiText(String(approveLog?.reviewComment || reviewComment || '').trim())
  if (raw) return raw.slice(0, 120)
  return '脱敏复核通过；平台合规审核通过'
}

function resolveComplianceGateA(album) {
  const status = String(album?.complianceStatus || '').trim().toLowerCase()
  if (status === 'passed') return 'passed'
  return 'unknown'
}

/**
 * @param {object} context
 * @param {object} context.row public_cases 行
 * @param {object} [context.album]
 * @param {object[]} [context.reviewLogs]
 * @param {Date|string} [context.reviewedAt]
 * @param {string} [context.reviewComment]
 */
function buildCaseTrustMeta(context = {}) {
  const row = context.row || {}
  const contentJson =
    row.contentJson && typeof row.contentJson === 'object' ? row.contentJson : {}
  const snapshot = extractSnapshotFromContentJson(contentJson)
  const snapshotVersion = resolveSnapshotVersion(contentJson)
  if (snapshotVersion < 1) return null

  const tierSource =
    snapshot?.authorizationTier || row.authorizationTier || row.authorization_tier || 'named'
  const tier = mapAuthorizationTierForTrust(tierSource)
  const publicImageCount = countPublicImages(contentJson, snapshot)
  const evidence = resolveEvidenceLevel(publicImageCount)

  const partial = {
    snapshotVersion,
    authorizedAt: resolveAuthorizedAt({ snapshot, album: context.album, row }),
    authorizationTier: tier.authorizationTier,
    authorizationTierLabel: tier.authorizationTierLabel,
    reviewStatus: 'approved',
    reviewedAt: resolveReviewedAt({
      row,
      reviewLogs: context.reviewLogs,
      override: context.reviewedAt,
    }),
    desensitized: true,
    evidenceLevel: evidence.evidenceLevel,
    evidenceLevelLabel: evidence.evidenceLevelLabel,
    publicImageCount,
    nodeStageCount: countNodeStages(snapshot),
    auditLogSummary: buildAuditLogSummary(context.reviewLogs, context.reviewComment),
    complianceGateA: resolveComplianceGateA(context.album),
    complianceGateB: 'passed',
    updatedAt: new Date().toISOString(),
  }

  partial.trustStatement = formatTrustStatement(partial)
  return normalizeCaseTrustMeta(partial)
}

/**
 * @param {string} caseId
 * @param {object} [options]
 */
async function refreshCaseTrustMeta(caseId, options = {}) {
  const db = options.db || prisma
  const row =
    options.row ||
    (await db.publicCase.findUnique({
      where: { id: caseId },
    }))
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }

  let album = options.album
  if (!album && row.albumId) {
    album = await db.album.findUnique({
      where: { id: row.albumId },
      include: { authorization: true },
    })
  }

  let reviewLogs = options.reviewLogs
  if (!reviewLogs && db.caseReviewLog) {
    reviewLogs = await db.caseReviewLog.findMany({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
  }

  const trustMeta = buildCaseTrustMeta({
    row,
    album,
    reviewLogs,
    reviewedAt: options.reviewedAt,
    reviewComment: options.reviewComment,
  })
  if (!trustMeta) {
    return { skipped: true, caseId, reason: 'no_snapshot' }
  }

  await persistCaseEnrichment(caseId, { trustMeta }, {
    bumpVersion: false,
    syncContentJsonGeo: false,
    db,
    row,
  })

  return { skipped: false, caseId, trustMeta }
}

module.exports = {
  buildCaseTrustMeta,
  refreshCaseTrustMeta,
  countPublicImages,
  countNodeStages,
}
