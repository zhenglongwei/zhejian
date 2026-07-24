/**
 * 闸门 B 风险分流：低风险自动过审 / 高风险人审 / 自动过审抽检
 */
const { prisma } = require('../lib/prisma')
const { RISK_LEVEL_ORDER } = require('../constants/v2')
const { ASSET_STATUS } = require('./desensitize.constants')
const { assessPublicCaseQuality } = require('./public-case-quality.service')
const {
  PUBLIC_GATE_STATUS,
  VISIBILITY,
} = require('../constants/album-public-visibility-policy')

const GATE_B_RISK = {
  LOW: 'low',
  HIGH: 'high',
}

const SPOT_CHECK_STATUS = {
  NONE: '',
  PENDING: 'pending',
  PASSED: 'passed',
  FAILED: 'failed',
}

function normalizeSpotCheckRate(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0.1
  return Math.min(1, Math.max(0, n))
}

function resolveGateBSpotCheckRate() {
  return normalizeSpotCheckRate(process.env.GATE_B_SPOT_CHECK_RATE)
}

function isElevatedRiskLevel(level) {
  const rank = RISK_LEVEL_ORDER[String(level || '').toLowerCase()] || 0
  return rank > RISK_LEVEL_ORDER.low
}

function isPublicFacingAsset(asset, publicImageKeys) {
  if (!publicImageKeys || !publicImageKeys.size) return true
  const key = `${asset.nodeId}_${asset.idx != null ? asset.idx : asset.index}`
  return publicImageKeys.has(key)
}

function collectPublicImageKeys(albumView = {}) {
  const keys = new Set()
  ;(albumView.imageMeta || []).forEach((row) => {
    if (
      row.visibility === VISIBILITY.PUBLIC &&
      row.publicGateStatus === PUBLIC_GATE_STATUS.PASSED
    ) {
      keys.add(`${row.nodeId}_${row.idx}`)
    }
  })
  return keys
}

function collectPublicMediaRiskReasons(task, albumView) {
  const reasons = []
  const publicKeys = collectPublicImageKeys(albumView)
  const assets = task?.rawAssets || []

  assets.forEach((asset) => {
    if (!isPublicFacingAsset(asset, publicKeys)) return
    const riskLevel = String(asset.riskLevel || '').toLowerCase()
    if (isElevatedRiskLevel(riskLevel)) {
      reasons.push(`public_media_risk:${riskLevel || 'unknown'}`)
    }
    if (asset.needManual || asset.status === ASSET_STATUS.MASK_FAILED) {
      reasons.push('public_media_need_manual')
    }
    if (String(asset.mediaDesensitizeStatus || '').toLowerCase() === 'need_manual') {
      reasons.push('public_media_need_manual')
    }
  })

  ;(albumView.imageMeta || []).forEach((row) => {
    if (
      row.visibility !== VISIBILITY.PUBLIC ||
      row.publicGateStatus !== PUBLIC_GATE_STATUS.PASSED
    ) {
      return
    }
    if (isElevatedRiskLevel(row.privacyRiskLevel || row.riskLevel)) {
      reasons.push(`image_meta_risk:${row.privacyRiskLevel || row.riskLevel}`)
    }
  })

  return [...new Set(reasons)]
}

async function hasOpenDispute(albumId, caseId = '') {
  const or = [{ targetType: 'album', targetId: String(albumId) }]
  if (caseId) {
    or.push({ targetType: 'case', targetId: String(caseId) })
  }
  const count = await prisma.contentReport.count({
    where: {
      status: 'pending',
      OR: or,
    },
  })
  return count > 0
}

/**
 * @param {{ album: object, albumView?: object, task?: object|null, openDispute?: boolean }} input
 * @returns {{ risk: 'low'|'high', reasons: string[] }}
 */
function evaluateGateBRiskSync(input = {}) {
  const album = input.album || {}
  const albumView = input.albumView || {}
  const task = input.task || null
  const reasons = []

  const templateId = String(album.templateId || albumView.templateId || '').toLowerCase()
  if (templateId === 'accident') {
    reasons.push('template_accident')
  }

  reasons.push(...collectPublicMediaRiskReasons(task, albumView))

  const quality = assessPublicCaseQuality(albumView)
  ;(quality.privacyBlocks || []).forEach((block) => {
    reasons.push(`privacy_block:${block.issue || block.kind || 'unknown'}`)
  })

  if (input.openDispute) {
    reasons.push('open_dispute')
  }

  const unique = [...new Set(reasons)]
  return {
    risk: unique.length ? GATE_B_RISK.HIGH : GATE_B_RISK.LOW,
    reasons: unique,
  }
}

/**
 * @param {{ album: object, albumView?: object, task?: object|null, caseId?: string }} input
 * @returns {Promise<{ risk: 'low'|'high', reasons: string[] }>}
 */
async function evaluateGateBRisk(input = {}) {
  const album = input.album || {}
  const openDispute = await hasOpenDispute(album.id || album.albumId, input.caseId)
  return evaluateGateBRiskSync({ ...input, openDispute })
}

function shouldSpotCheckGateB(caseIdOrAlbumId) {
  const rate = resolveGateBSpotCheckRate()
  if (rate <= 0) return false
  let hash = 0
  const key = String(caseIdOrAlbumId || '')
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  const bucket = (hash % 10000) / 10000
  return bucket < rate
}

module.exports = {
  GATE_B_RISK,
  SPOT_CHECK_STATUS,
  evaluateGateBRisk,
  evaluateGateBRiskSync,
  shouldSpotCheckGateB,
  resolveGateBSpotCheckRate,
  normalizeSpotCheckRate,
  isElevatedRiskLevel,
}
