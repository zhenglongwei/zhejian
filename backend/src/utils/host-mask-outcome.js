/**
 * 托管自动打码状态树（15_ §6.1）：禁止把「未检出」当成失败。
 * call_failed / ok_detect_mask_failed 才需手工；ok_no_privacy / ok_masked 可上店页。
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
    }
  }

  if (mediaStatus === 'success' || (READY_ASSET_STATUSES.has(assetStatus) && hasMaskedUrl)) {
    return {
      outcome: tags.length
        ? HOST_MASK_OUTCOME.OK_MASKED
        : HOST_MASK_OUTCOME.OK_NO_PRIVACY,
      needsManual: false,
      publishSafe: true,
    }
  }

  if (mediaStatus === 'failed' || assetStatus === 'mask_failed') {
    // 有检出却贴不上 → 打码失败；无检出标签多为 OCR/网络等客观失败
    const outcome = tags.length
      ? HOST_MASK_OUTCOME.OK_DETECT_MASK_FAILED
      : HOST_MASK_OUTCOME.CALL_FAILED
    return { outcome, needsManual: true, publishSafe: false }
  }

  // 仅有脱敏 URL、无任务行：视为已处理可公开（无法区分是否检出）
  if (hasMaskedUrl && !assetStatus && !mediaStatus) {
    return {
      outcome: tags.length ? HOST_MASK_OUTCOME.OK_MASKED : HOST_MASK_OUTCOME.OK_NO_PRIVACY,
      needsManual: false,
      publishSafe: true,
    }
  }

  return {
    outcome: HOST_MASK_OUTCOME.PENDING,
    needsManual: false,
    publishSafe: false,
  }
}

function needsHostMaskAction(outcome) {
  return (
    outcome === HOST_MASK_OUTCOME.CALL_FAILED ||
    outcome === HOST_MASK_OUTCOME.OK_DETECT_MASK_FAILED
  )
}

module.exports = {
  HOST_MASK_OUTCOME,
  classifyHostMaskOutcome,
  needsHostMaskAction,
}
