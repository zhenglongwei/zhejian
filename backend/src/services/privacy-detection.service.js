const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')
const { ENGINE_VERSION } = require('./desensitize-engine')

/** PRD 06 §17.3 detect_type */
const DETECT_TYPES = ['plate', 'face', 'ocr', 'vin', 'phone']

const BOX_TYPE_TO_DETECT_TYPE = {
  plate: 'plate',
  face: 'face',
  vin: 'vin',
  phone: 'phone',
  document: 'ocr',
  mixed: 'plate',
}

function privacyDetectionRepo() {
  return prisma && prisma.privacyDetectionResult ? prisma.privacyDetectionResult : null
}

function normalizeCaseId(caseId) {
  return caseId ? String(caseId) : ''
}

function truncateWarnings(warnings) {
  return (warnings || [])
    .slice(0, 8)
    .map((w) => String(w || '').slice(0, 200))
}

function groupDetectionsByDetectType(detections) {
  const groups = {}
  ;(detections || []).forEach((box) => {
    const detectType = BOX_TYPE_TO_DETECT_TYPE[box.type] || 'ocr'
    if (!groups[detectType]) groups[detectType] = []
    groups[detectType].push({
      type: box.type,
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
      source: box.source || '',
    })
  })
  return groups
}

function mapDesensitizeStatusToDetectionStatus(desensitizeStatus) {
  if (desensitizeStatus === 'need_manual') return 'need_manual'
  if (desensitizeStatus === 'failed') return 'failed'
  return 'success'
}

/**
 * 写入 §17.3 表；同 imageId+caseId 下按 detect_type 覆盖最新一轮。
 */
async function persistPrivacyDetectionResults({
  imageId,
  caseId = '',
  engineResult = {},
  maskedPath = '',
  desensitizeStatus = 'success',
}) {
  const repo = privacyDetectionRepo()
  if (!repo || !imageId) return []

  const normalizedCaseId = normalizeCaseId(caseId)
  const riskLevel = engineResult.riskLevel || 'low'
  const status = mapDesensitizeStatusToDetectionStatus(desensitizeStatus)
  const groups = groupDetectionsByDetectType(engineResult.detections || [])
  const warnings = truncateWarnings(engineResult.warnings)
  const engineVersion = engineResult.engineVersion || ENGINE_VERSION

  await repo.deleteMany({
    where: { imageId, caseId: normalizedCaseId },
  })

  const rows = []
  const detectTypes = Object.keys(groups)
  if (!detectTypes.length) {
    rows.push({
      id: newId('pdr'),
      imageId,
      caseId: normalizedCaseId,
      detectType: 'ocr',
      resultJson: {
        boxes: [],
        engineVersion,
        warnings,
        riskTags: engineResult.riskTags || [],
      },
      riskLevel,
      maskedPath: maskedPath || '',
      status,
    })
  } else {
    detectTypes.forEach((detectType) => {
      if (!DETECT_TYPES.includes(detectType)) return
      rows.push({
        id: newId('pdr'),
        imageId,
        caseId: normalizedCaseId,
        detectType,
        resultJson: {
          boxes: groups[detectType],
          engineVersion,
          warnings,
          riskTags: engineResult.riskTags || [],
        },
        riskLevel,
        maskedPath: maskedPath || '',
        status,
      })
    })
  }

  if (rows.length) {
    await repo.createMany({ data: rows })
  }
  return rows
}

async function hasPrivacyDetectionRecords(imageId, caseId = '') {
  const repo = privacyDetectionRepo()
  if (!repo || !imageId) return false
  const count = await repo.count({
    where: { imageId, caseId: normalizeCaseId(caseId) },
  })
  return count > 0
}

async function listPrivacyDetectionsByImageId(imageId, options = {}) {
  const repo = privacyDetectionRepo()
  if (!repo || !imageId) return []
  const caseId = normalizeCaseId(options.caseId)
  const rows = await repo.findMany({
    where: { imageId, caseId },
    orderBy: { detectType: 'asc' },
  })
  return rows.map((row) => ({
    id: row.id,
    imageId: row.imageId,
    caseId: row.caseId || '',
    detectType: row.detectType,
    riskLevel: row.riskLevel,
    maskedPath: row.maskedPath,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    resultJson: options.includeResultJson === false ? undefined : row.resultJson,
  }))
}

function needsPrivacyDetectionRefresh(media, context = {}) {
  if (!media) return true
  if (context.engineVersion && context.engineVersion !== ENGINE_VERSION) return true
  if (media.engineVersion && media.engineVersion !== ENGINE_VERSION) return true
  if (!media.privacyDetectedAt) return true
  return false
}

function buildPrivacySummaryFromMedia(media) {
  if (!media) {
    return { riskLevel: '', riskTags: [], engineVersion: '' }
  }
  return {
    riskLevel: media.privacyRiskLevel || '',
    riskTags: Array.isArray(media.riskTags) ? media.riskTags : [],
    engineVersion: media.engineVersion || '',
    privacyDetectedAt: media.privacyDetectedAt
      ? media.privacyDetectedAt.toISOString()
      : '',
  }
}

async function loadCachedPrivacyResult(media, context = {}) {
  const summary = buildPrivacySummaryFromMedia(media)
  const hasRecords = await hasPrivacyDetectionRecords(media.id, context.caseId)
  return {
    ...summary,
    hasDetectionRecords: hasRecords,
  }
}

async function linkPrivacyDetectionsToCase(imageIds, caseId) {
  const repo = privacyDetectionRepo()
  if (!repo || !caseId || !imageIds?.length) return 0
  const normalizedCaseId = normalizeCaseId(caseId)
  const result = await repo.updateMany({
    where: {
      imageId: { in: imageIds },
      caseId: '',
    },
    data: { caseId: normalizedCaseId },
  })
  return result.count
}

module.exports = {
  DETECT_TYPES,
  groupDetectionsByDetectType,
  persistPrivacyDetectionResults,
  hasPrivacyDetectionRecords,
  listPrivacyDetectionsByImageId,
  needsPrivacyDetectionRefresh,
  buildPrivacySummaryFromMedia,
  loadCachedPrivacyResult,
  linkPrivacyDetectionsToCase,
}
