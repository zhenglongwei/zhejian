const {
  PUBLIC_GATE_STATUS,
  VISIBILITY,
  isAlwaysPrivateStage,
} = require('../constants/album-public-visibility-policy')

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

async function checkPublicGateForImage() {
  // 公开闸不再调用识别接口。车牌、车架号、人脸在看图时由模型给区域再打。
  return { passed: true, riskTags: [], reason: '' }
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
