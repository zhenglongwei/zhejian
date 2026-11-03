/**
 * 节点图打码状态机（真源：skill_node_mask_state_machine / 15_ §公开前打码）
 *
 * 结论只认节点 maskOutcome（任务/媒体表仅旁路推断）。
 * 首次托管：仅 not_analyzed 跑大模型，结束后必须登记结论（成功或失败）。
 * 再次托管 / 已登记：只按结论选原图或打码图，禁止再跑大模型。
 * 手工打码：同样写回 ok_masked + maskedUrl。
 */

const HOST_MASK_OUTCOME = {
  NOT_ANALYZED: 'not_analyzed',
  LLM_FAILED: 'llm_failed',
  OK_NO_PRIVACY: 'ok_no_privacy',
  OK_MASKED: 'ok_masked',
  MASK_FAILED: 'mask_failed',
  /** @deprecated 兼容旧库 → NOT_ANALYZED */
  PENDING: 'pending',
  /** @deprecated 兼容旧库 → LLM_FAILED */
  CALL_FAILED: 'call_failed',
  /** @deprecated 兼容旧库 → MASK_FAILED */
  OK_DETECT_MASK_FAILED: 'ok_detect_mask_failed',
}

const READY_ASSET_STATUSES = new Set(['masked_ready', 'manual_masked', 'confirmed'])

/** @typedef {'skip'|'rerun_llm'|'restamp'} HostMaskAction */

function normalizeRiskTags(tags) {
  return Array.isArray(tags) ? tags.map((t) => String(t || '').trim()).filter(Boolean) : []
}

function normalizeOutcomeCode(raw) {
  const explicit = String(raw || '').trim()
  if (!explicit) return ''
  if (explicit === HOST_MASK_OUTCOME.PENDING) return HOST_MASK_OUTCOME.NOT_ANALYZED
  if (explicit === HOST_MASK_OUTCOME.CALL_FAILED) return HOST_MASK_OUTCOME.LLM_FAILED
  if (explicit === HOST_MASK_OUTCOME.OK_DETECT_MASK_FAILED) return HOST_MASK_OUTCOME.MASK_FAILED
  return explicit
}

function pack(outcome, extra = {}) {
  const action = hostMaskAction(outcome)
  const success =
    outcome === HOST_MASK_OUTCOME.OK_NO_PRIVACY || outcome === HOST_MASK_OUTCOME.OK_MASKED
  return {
    outcome,
    needsManual: Boolean(extra.needsManual) || action === 'restamp' || action === 'rerun_llm',
    /** 成功态可公开；失败态也允许原图上网（责任在商家） */
    publishSafe: true,
    maskSucceeded: success,
    needsRemask: action !== 'skip',
    hostAction: action,
    allowsOriginalPublish: !success,
  }
}

/**
 * @param {{ status?: string, riskTags?: string[], maskedUrl?: string, preMaskedUrl?: string, needManual?: boolean, desensitizeStatus?: string, maskOutcome?: string, maskRegions?: array }} row
 */
function classifyHostMaskOutcome(row = {}) {
  const tags = normalizeRiskTags(row.riskTags)
  const hasMaskedUrl = Boolean(String(row.maskedUrl || row.preMaskedUrl || '').trim())
  const assetStatus = String(row.status || '').trim()
  const mediaStatus = String(row.desensitizeStatus || '').trim()
  const explicit = normalizeOutcomeCode(row.maskOutcome)
  const regions = Array.isArray(row.maskRegions) ? row.maskRegions : null
  const hasRegions = Boolean(regions && regions.length) || tags.length > 0
  const needManual = Boolean(row.needManual) || mediaStatus === 'need_manual'

  // 节点已写明结论：优先（真源）
  if (explicit === HOST_MASK_OUTCOME.OK_NO_PRIVACY) {
    return pack(HOST_MASK_OUTCOME.OK_NO_PRIVACY, { needsManual: false })
  }
  if (explicit === HOST_MASK_OUTCOME.OK_MASKED) {
    if (hasMaskedUrl) {
      return pack(HOST_MASK_OUTCOME.OK_MASKED, { needsManual: false })
    }
    // 标了已打码却无产物 → 按贴码失败重贴
    return pack(HOST_MASK_OUTCOME.MASK_FAILED, { needsManual: true })
  }
  if (explicit === HOST_MASK_OUTCOME.MASK_FAILED) {
    return pack(HOST_MASK_OUTCOME.MASK_FAILED, { needsManual: true })
  }
  if (explicit === HOST_MASK_OUTCOME.LLM_FAILED) {
    return pack(HOST_MASK_OUTCOME.LLM_FAILED, { needsManual: true })
  }
  if (explicit === HOST_MASK_OUTCOME.NOT_ANALYZED) {
    return pack(HOST_MASK_OUTCOME.NOT_ANALYZED, { needsManual: false })
  }

  if (needManual) {
    return pack(
      hasRegions || hasMaskedUrl
        ? HOST_MASK_OUTCOME.MASK_FAILED
        : HOST_MASK_OUTCOME.LLM_FAILED,
      { needsManual: true },
    )
  }

  // 旁路：媒体/任务行（无节点结论时）
  if (mediaStatus === 'success') {
    if (hasMaskedUrl) {
      return pack(HOST_MASK_OUTCOME.OK_MASKED, { needsManual: false })
    }
    if (tags.length) {
      return pack(HOST_MASK_OUTCOME.MASK_FAILED, { needsManual: true })
    }
    return pack(HOST_MASK_OUTCOME.OK_NO_PRIVACY, { needsManual: false })
  }
  if (READY_ASSET_STATUSES.has(assetStatus)) {
    if (hasMaskedUrl) {
      return pack(
        tags.length ? HOST_MASK_OUTCOME.OK_MASKED : HOST_MASK_OUTCOME.OK_NO_PRIVACY,
        { needsManual: false },
      )
    }
    // 已结算且无产物、无风险标签 = 无须打码（可展示原图）
    if (!tags.length) {
      return pack(HOST_MASK_OUTCOME.OK_NO_PRIVACY, { needsManual: false })
    }
    return pack(HOST_MASK_OUTCOME.MASK_FAILED, { needsManual: true })
  }

  if (mediaStatus === 'failed' || assetStatus === 'mask_failed') {
    return pack(
      tags.length ? HOST_MASK_OUTCOME.MASK_FAILED : HOST_MASK_OUTCOME.LLM_FAILED,
      { needsManual: true },
    )
  }

  if (hasMaskedUrl && !assetStatus && !mediaStatus) {
    return pack(
      tags.length ? HOST_MASK_OUTCOME.OK_MASKED : HOST_MASK_OUTCOME.OK_NO_PRIVACY,
      { needsManual: false },
    )
  }

  return pack(HOST_MASK_OUTCOME.NOT_ANALYZED, { needsManual: false })
}

function isMaskCallSuccess(outcome) {
  const code = normalizeOutcomeCode(outcome)
  return (
    code === HOST_MASK_OUTCOME.OK_NO_PRIVACY || code === HOST_MASK_OUTCOME.OK_MASKED
  )
}

/** @returns {HostMaskAction} */
function hostMaskAction(outcome) {
  const code = normalizeOutcomeCode(outcome)
  // 仅从未登记才跑模型；已登记（成功或失败）二次托管只读选图
  if (!code || code === HOST_MASK_OUTCOME.NOT_ANALYZED || code === HOST_MASK_OUTCOME.PENDING) {
    return 'rerun_llm'
  }
  return 'skip'
}

function needsHostMaskAction(outcome) {
  return hostMaskAction(outcome) !== 'skip'
}

/**
 * 公开/托管读图：有码用码；无须打码或失败态用原图。
 * @returns {string}
 */
function resolveHostDisplayUrl(row = {}, rawFallback = '') {
  const raw = String(
    rawFallback || row.url || row.src || row.rawUrl || '',
  ).trim()
  const classified = classifyHostMaskOutcome(row)
  if (classified.outcome === HOST_MASK_OUTCOME.OK_MASKED) {
    const masked = String(row.maskedUrl || row.preMaskedUrl || row.desensitizedUrl || '').trim()
    return masked || raw
  }
  return raw
}

module.exports = {
  HOST_MASK_OUTCOME,
  classifyHostMaskOutcome,
  isMaskCallSuccess,
  needsHostMaskAction,
  hostMaskAction,
  normalizeOutcomeCode,
  resolveHostDisplayUrl,
}
