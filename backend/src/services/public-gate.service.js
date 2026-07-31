const sharp = require('sharp')
const { config } = require('../config')
const {
  buildPublicMediaUrl,
  parseObjectKeyFromPublicUrl,
  parseDesensitizedObjectKeyFromPublicUrl,
} = require('../lib/media-storage')
const { materializeMediaFile, objectKeyFromPublicUrl } = require('../lib/media-blob')
const { detectSensitiveRegions } = require('./desensitize-engine/detectors/aliyun')
const {
  PUBLIC_GATE_STATUS,
  VISIBILITY,
  isAlwaysPrivateStage,
} = require('../constants/album-public-visibility-policy')

const BLOCK_TAGS = new Set(['plate', 'vin', 'face', 'phone', 'document'])
/** 质保承诺书本质是单据图，但需进入公示池并走脱敏；仅忽略 document 标签 */
const WARRANTY_GATE_BLOCK_TAGS = new Set(['plate', 'vin', 'face', 'phone'])

const GATE_HINTS = {
  plate: '检测到车牌信息，已保存为留档，不可进入公示素材',
  vin: '检测到 VIN 信息，已保存为留档，不可进入公示素材',
  face: '检测到人脸信息，已保存为留档，不可进入公示素材',
  phone: '检测到手机号，已保存为留档，不可进入公示素材',
  document: '检测到单据/证件类信息，已保存为留档，不可进入公示素材',
  file_unavailable: '图片文件不可用，已保存为留档',
  stage_private_only: '本阶段图片仅用于留档，不会进入公示',
}

function gateHintForReason(reason = '') {
  return GATE_HINTS[reason] || GATE_HINTS.document
}

async function checkPublicGateForImage(rawUrl, options = {}) {
  if (config.desensitize.engine === 'dev') {
    return { passed: true, riskTags: [], reason: '' }
  }

  const objectKey =
    objectKeyFromPublicUrl(rawUrl) ||
    parseObjectKeyFromPublicUrl(rawUrl) ||
    parseDesensitizedObjectKeyFromPublicUrl(rawUrl)
  if (!objectKey) {
    return { passed: false, riskTags: ['unavailable'], reason: 'file_unavailable' }
  }

  let materialized
  try {
    materialized = await materializeMediaFile(objectKey)
  } catch (_) {
    return { passed: false, riskTags: ['unavailable'], reason: 'file_unavailable' }
  }

  const localPath = materialized.filePath
  let imageWidth = 0
  let imageHeight = 0
  try {
    const meta = await sharp(localPath).metadata()
    imageWidth = meta.width || 0
    imageHeight = meta.height || 0
  } catch (_) {
    if (materialized.cleanup) await materialized.cleanup()
    return { passed: false, riskTags: ['unavailable'], reason: 'file_unavailable' }
  }

  const publicUrl = buildPublicMediaUrl(objectKey)
  const blockTags = options.ignoreDocumentTag ? WARRANTY_GATE_BLOCK_TAGS : BLOCK_TAGS

  try {
    const detection = await detectSensitiveRegions(localPath, {
      publicUrl,
      imageWidth,
      imageHeight,
    })
    const tags = Array.isArray(detection.riskTags) ? detection.riskTags : []
    const blocked = tags.some((tag) => blockTags.has(tag)) || Boolean(detection.plateMaskMiss)
    const reason = blocked
      ? tags.find((tag) => blockTags.has(tag)) || (detection.plateMaskMiss ? 'plate' : 'document')
      : ''
    return {
      passed: !blocked,
      riskTags: tags,
      reason,
    }
  } catch (error) {
    console.warn('[public-gate] detect failed', error.message)
    return { passed: false, riskTags: ['detect_error'], reason: 'document' }
  } finally {
    if (materialized && materialized.cleanup) {
      await materialized.cleanup()
    }
  }
}

/**
 * @param {string} nodeId
 * @param {string} rawUrl
 * @param {Map<string, object>} [gateCache] normalizedUrl -> prior gate fields
 * @param {{ ignoreDocumentTag?: boolean }} [options]
 */
async function resolveImagePublicFields(nodeId, rawUrl, gateCache = new Map(), options = {}) {
  const normalizedUrl = String(rawUrl || '').trim()
  if (isAlwaysPrivateStage(nodeId)) {
    return {
      visibility: VISIBILITY.PRIVATE,
      publicGateStatus: PUBLIC_GATE_STATUS.SKIPPED,
      publicGateReason: 'stage_private_only',
      publicGateCheckedAt: new Date(),
      hint: gateHintForReason('stage_private_only'),
    }
  }

  const cached = gateCache.get(normalizedUrl)
  if (cached && cached.publicGateStatus && cached.publicGateStatus !== PUBLIC_GATE_STATUS.PENDING) {
    return {
      visibility: cached.visibility || VISIBILITY.PRIVATE,
      publicGateStatus: cached.publicGateStatus,
      publicGateReason: cached.publicGateReason || '',
      publicGateCheckedAt: cached.publicGateCheckedAt || new Date(),
      hint: gateHintForReason(cached.publicGateReason),
    }
  }

  const gate = await checkPublicGateForImage(normalizedUrl, {
    ignoreDocumentTag: Boolean(options.ignoreDocumentTag),
  })
  if (gate.passed) {
    return {
      visibility: VISIBILITY.PUBLIC,
      publicGateStatus: PUBLIC_GATE_STATUS.PASSED,
      publicGateReason: '',
      publicGateCheckedAt: new Date(),
      hint: '',
    }
  }

  return {
    visibility: VISIBILITY.PRIVATE,
    publicGateStatus: PUBLIC_GATE_STATUS.REJECTED,
    publicGateReason: gate.reason || 'document',
    publicGateCheckedAt: new Date(),
    hint: gateHintForReason(gate.reason),
  }
}

module.exports = {
  checkPublicGateForImage,
  resolveImagePublicFields,
  gateHintForReason,
  GATE_HINTS,
}
