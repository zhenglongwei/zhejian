/**
 * 公示就绪评估（方案 B · 隐私硬门槛 + 质量分）
 *
 * - 隐私/合规：一票否决，不计入质量分（文案 PII、绝对化承诺、图 gate 隐私拦截导致无公示素材）
 * - 质量分：证据链 geo + 文案质量（仅 weak 项扣分），均分 0–100，≥70 达标
 */
const { assessGeoEvidence } = require('../utils/case-geo-quality')
const { assessCopyQuality } = require('./copy-quality.service')
const {
  PUBLIC_GATE_STATUS,
  VISIBILITY,
  isAlwaysPrivateStage,
} = require('../constants/album-public-visibility-policy')
const { GATE_HINTS } = require('./public-gate.service')

const PUBLIC_CASE_SCORE_PASS_THRESHOLD = 70

const PRIVACY_GATE_REASONS = new Set(['plate', 'vin', 'face', 'phone', 'document'])
const PRIVACY_COPY_ISSUES = new Set(['pii_in_note'])
const COMPLIANCE_COPY_ISSUES = new Set(['absolute_claim'])

const COPY_QUALITY_PENALTIES = {
  plan_text_missing: 15,
  public_plan_empty: 10,
  no_public_media: 12,
  note_missing_for_public_image: 4,
  note_too_short: 5,
  template_note: 6,
}

function countPublicMedia(imageMeta = []) {
  return imageMeta.filter(
    (row) =>
      row.visibility === VISIBILITY.PUBLIC &&
      row.publicGateStatus === PUBLIC_GATE_STATUS.PASSED,
  ).length
}

function assessPrivacyComplianceBlocks(albumView = {}, copyQuality = {}) {
  const blocks = []
  const imageMeta = albumView.imageMeta || []
  const publicMediaCount = countPublicMedia(imageMeta)

  ;(copyQuality.suggestions || []).forEach((item) => {
    if (PRIVACY_COPY_ISSUES.has(item.issue)) {
      blocks.push({
        kind: 'privacy',
        issue: item.issue,
        field: item.field || 'copy',
        message: item.message || '说明中含手机号/车牌等隐私信息，请修改后再引导授权公示',
      })
    }
    if (COMPLIANCE_COPY_ISSUES.has(item.issue)) {
      blocks.push({
        kind: 'compliance',
        issue: item.issue,
        field: item.field || 'copy',
        message: item.message || '文案含违规表述，请修改后再引导授权公示',
      })
    }
  })

  const privacyRejectedImages = imageMeta.filter(
    (row) =>
      !isAlwaysPrivateStage(row.nodeId) &&
      row.publicGateStatus === PUBLIC_GATE_STATUS.REJECTED &&
      PRIVACY_GATE_REASONS.has(String(row.publicGateReason || '')),
  )

  if (publicMediaCount < 1 && privacyRejectedImages.length > 0) {
    const reasons = [
      ...new Set(
        privacyRejectedImages
          .map((row) => row.publicGateReason)
          .filter((reason) => PRIVACY_GATE_REASONS.has(String(reason || ''))),
      ),
    ]
    const hint =
      reasons.length === 1
        ? GATE_HINTS[reasons[0]] || GATE_HINTS.document
        : '过程图含车牌/人脸/手机号等敏感信息，暂无可公示素材'
    blocks.push({
      kind: 'privacy',
      issue: 'no_public_media_privacy',
      field: 'publicMedia',
      message: `${hint}。请补充可公示过程图后再引导车主授权。`,
    })
  }

  return blocks
}

function computeCopyQualityScore(copyQuality = {}) {
  let score = 100
  ;(copyQuality.suggestions || []).forEach((item) => {
    if (item.level === 'block') return
    score -= COPY_QUALITY_PENALTIES[item.issue] || 5
  })
  return Math.max(0, Math.min(100, score))
}

function computePublicCaseQualityScore(geoQuality = {}, copyQuality = {}) {
  const geoScore = Number.isFinite(Number(geoQuality.score)) ? Number(geoQuality.score) : 0
  const copyScore = computeCopyQualityScore(copyQuality)
  return Math.max(0, Math.min(100, Math.round((geoScore + copyScore) / 2)))
}

function buildQualitySuggestions(geoQuality = {}, copyQuality = {}) {
  const list = []
  ;(geoQuality.missingFields || []).forEach((item) => {
    list.push({
      field: item.field || item.stage || 'geo',
      level: 'weak',
      category: 'quality',
      message: item.message || '证据链待完善',
      source: 'geo',
    })
  })
  ;(geoQuality.warnings || []).forEach((item) => {
    list.push({
      field: item.field || 'geo',
      level: 'weak',
      category: 'quality',
      message: item.message || '',
      source: 'geo',
    })
  })
  ;(copyQuality.suggestions || []).forEach((item) => {
    if (item.level === 'block') return
    list.push({
      field: item.field || 'copy',
      level: 'weak',
      category: 'quality',
      message: item.message || '',
      source: 'copy',
    })
  })
  return list.slice(0, 16)
}

function buildPublicCaseSuggestions(privacyBlocks = [], qualitySuggestions = []) {
  const hard = privacyBlocks.map((item) => ({
    field: item.field || '',
    level: 'block',
    category: item.kind === 'compliance' ? 'compliance' : 'privacy',
    issue: item.issue || '',
    message: item.message || '',
    source: item.kind || 'privacy',
  }))
  return [...hard, ...qualitySuggestions].slice(0, 20)
}

function buildPublicCaseScoreSummary(publicCaseScore, publicCaseScorePass, privacyBlocks) {
  const parts = [`质量分 ${publicCaseScore}/${PUBLIC_CASE_SCORE_PASS_THRESHOLD}`]
  if (privacyBlocks.length) {
    parts.push('存在隐私/合规硬项，须先处理')
  } else if (publicCaseScorePass) {
    parts.push('已达公示引导标准')
  } else {
    parts.push('质量分未达标，建议完善后再引导车主授权公示')
  }
  return parts.join('；')
}

function assessPublicCaseQuality(albumView = {}) {
  const geoQuality = assessGeoEvidence({
    nodes: albumView.nodes || [],
    coldStart: false,
    serviceName: albumView.serviceName,
    planAmount: albumView.planAmount,
    storeNote: albumView.storeNote,
    imageCount: albumView.imageCount,
  })
  const copyQuality = assessCopyQuality(albumView)
  const privacyBlocks = assessPrivacyComplianceBlocks(albumView, copyQuality)
  const qualitySuggestions = buildQualitySuggestions(geoQuality, copyQuality)
  const publicCaseSuggestions = buildPublicCaseSuggestions(
    privacyBlocks,
    qualitySuggestions,
  )
  const publicCaseScore = computePublicCaseQualityScore(geoQuality, copyQuality)
  const publicCasePrivacyPass = privacyBlocks.length === 0
  const publicCaseScorePass =
    publicCasePrivacyPass && publicCaseScore >= PUBLIC_CASE_SCORE_PASS_THRESHOLD

  return {
    geoQuality,
    copyQuality,
    publicCaseScore,
    publicCasePrivacyPass,
    privacyBlocks,
    qualitySuggestions,
    publicCaseScorePass,
    publicCaseScoreThreshold: PUBLIC_CASE_SCORE_PASS_THRESHOLD,
    publicCaseSuggestions,
    publicCaseScoreSummary: buildPublicCaseScoreSummary(
      publicCaseScore,
      publicCaseScorePass,
      privacyBlocks,
    ),
    /** @deprecated 使用 publicCaseScorePass */
    publicCaseQualityReady: publicCaseScorePass,
  }
}

function assertPublicCaseQualityReady(albumView) {
  const quality = assessPublicCaseQuality(albumView)
  if (quality.publicCaseScorePass) return quality

  const reasons = []
  quality.privacyBlocks.slice(0, 3).forEach((item) => {
    reasons.push(item.message)
  })
  if (quality.publicCasePrivacyPass && quality.publicCaseScore < PUBLIC_CASE_SCORE_PASS_THRESHOLD) {
    reasons.push(
      `质量分 ${quality.publicCaseScore}，未达 ${PUBLIC_CASE_SCORE_PASS_THRESHOLD} 分标准`,
    )
  }
  const err = new Error('相册内容尚未满足公示质量要求，暂不可授权公示')
  err.status = 409
  err.code = 'PUBLIC_CASE_QUALITY_BLOCKED'
  err.geoQuality = quality.geoQuality
  err.copyQuality = quality.copyQuality
  err.publicCaseScore = quality.publicCaseScore
  err.publicCasePrivacyPass = quality.publicCasePrivacyPass
  err.privacyBlocks = quality.privacyBlocks
  err.publicCaseScorePass = quality.publicCaseScorePass
  err.reason = reasons.filter(Boolean).join('；') || quality.publicCaseScoreSummary
  throw err
}

module.exports = {
  PUBLIC_CASE_SCORE_PASS_THRESHOLD,
  assessPublicCaseQuality,
  assertPublicCaseQualityReady,
  assessPrivacyComplianceBlocks,
  computePublicCaseQualityScore,
}
