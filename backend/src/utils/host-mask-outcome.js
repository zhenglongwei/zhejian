/**
 * 托管公开打码状态树（15_ §6.1）
 *
 * 打码成功 = 打码程序调用成功（不要求必须检出隐私）：
 *   ok_no_privacy | ok_masked → 可复用，公开轮不重打
 * 必须重打：
 *   call_failed（OCR/网络未跑通）
 *   ok_detect_mask_failed（检出了但贴码失败 / need_manual）
 *   pending（从未跑过 / 仅原图）
 */

const HOST_MASK_OUTCOME = {
  PENDING: 'pending',
  CALL_FAILED: 'call_failed',
  OK_NO_PRIVACY: 'ok_no_privacy',
  OK_MASKED: 'ok_masked',
  OK_DETECT_MASK_FAILED: 'ok_detect_mask_failed',
}

const READY_ASSET_STATUSES = new Set(['masked_ready', 'manual_masked', 'confirmed'])

function normalizeRiskTags(tags) {
  return Array.isArray(tags) ? tags.map((t) => String(t || '').trim()).filter(Boolean) : []
}

/**
 * @param {{ status?: string, riskTags?: string[], maskedUrl?: string, preMaskedUrl?: string, needManual?: boolean, desensitizeStatus?: string }} row
 */
function classifyHostMaskOutcome(row = {}) {
  const tags = normalizeRiskTags(row.riskTags)
  const hasMaskedUrl = Boolean(String(row.maskedUrl || row.preMaskedUrl || '').trim())
  const assetStatus = String(row.status || '').trim()
  const mediaStatus = String(row.desensitizeStatus || '').trim()
  const needManual = Boolean(row.needManual) || mediaStatus === 'need_manual'

  if (needManual) {
    return {
      outcome: HOST_MASK_OUTCOME.OK_DETECT_MASK_FAILED,
      needsManual: true,
      publishSafe: false,
      maskSucceeded: false,
      needsRemask: true,
    }
  }

  // 打码成功：调用成功即可（含未检出隐私）
  if (mediaStatus === 'success' || (READY_ASSET_STATUSES.has(assetStatus) && hasMaskedUrl)) {
    const outcome = tags.length
      ? HOST_MASK_OUTCOME.OK_MASKED
      : HOST_MASK_OUTCOME.OK_NO_PRIVACY
    return {
      outcome,
      needsManual: false,
      publishSafe: true,
      maskSucceeded: true,
      needsRemask: false,
    }
  }

  if (mediaStatus === 'failed' || assetStatus === 'mask_failed') {
    const outcome = tags.length
      ? HOST_MASK_OUTCOME.OK_DETECT_MASK_FAILED
      : HOST_MASK_OUTCOME.CALL_FAILED
    return {
      outcome,
      needsManual: true,
      publishSafe: false,
      maskSucceeded: false,
      needsRemask: true,
    }
  }

  if (hasMaskedUrl && !assetStatus && !mediaStatus) {
    const outcome = tags.length
      ? HOST_MASK_OUTCOME.OK_MASKED
      : HOST_MASK_OUTCOME.OK_NO_PRIVACY
    return {
      outcome,
      needsManual: false,
      publishSafe: true,
      maskSucceeded: true,
      needsRemask: false,
    }
  }

  return {
    outcome: HOST_MASK_OUTCOME.PENDING,
    needsManual: false,
    publishSafe: false,
    maskSucceeded: false,
    needsRemask: true,
  }
}

function isMaskCallSuccess(outcome) {
  return (
    outcome === HOST_MASK_OUTCOME.OK_NO_PRIVACY || outcome === HOST_MASK_OUTCOME.OK_MASKED
  )
}

function needsHostMaskAction(outcome) {
  return (
    outcome === HOST_MASK_OUTCOME.CALL_FAILED ||
    outcome === HOST_MASK_OUTCOME.OK_DETECT_MASK_FAILED ||
    outcome === HOST_MASK_OUTCOME.PENDING
  )
}

module.exports = {
  HOST_MASK_OUTCOME,
  classifyHostMaskOutcome,
  isMaskCallSuccess,
  needsHostMaskAction,
}
