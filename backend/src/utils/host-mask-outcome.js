/**
 * 节点图打码状态机（真源：skill_node_mask_state_machine / 15_ §公开前打码）
 *
 * 结论只认节点 maskOutcome（托管路径 nodeOnly 不读任务行/媒体表）。
 * not_analyzed / llm_failed → 重跑大模型；mask_failed → 只重贴码；ok_* → 跳过。
 * 手工打码写回 ok_masked + maskSource=manual，此后永不再跑模型、永不再自动贴码。
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

const HOST_MASK_SOURCE = {
  AUTO: 'auto',
  MANUAL: 'manual',
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
  const hasRegions =
    typeof extra.hasRegions === 'boolean' ? extra.hasRegions : Boolean(extra.maskRegions && extra.maskRegions.length)
  const action = hostMaskAction(outcome, { hasRegions })
  const success =
    outcome === HOST_MASK_OUTCOME.OK_NO_PRIVACY || outcome === HOST_MASK_OUTCOME.OK_MASKED
  const source = String(extra.maskSource || '').trim()
  return {
    outcome,
    maskSource:
      source === HOST_MASK_SOURCE.MANUAL || source === HOST_MASK_SOURCE.AUTO ? source : '',
    needsManual: Boolean(extra.needsManual) || action !== 'skip',
    /** 成功态可公开；失败态也允许原图上网（责任在商家） */
    publishSafe: true,
    maskSucceeded: success,
    needsRemask: action !== 'skip',
    hostAction: action,
    allowsOriginalPublish: !success,
  }
}

/**
 * @param {{ status?: string, riskTags?: string[], maskedUrl?: string, preMaskedUrl?: string, needManual?: boolean, desensitizeStatus?: string, maskOutcome?: string, maskSource?: string, maskRegions?: array }} row
 * @param {{ nodeOnly?: boolean }} [options] nodeOnly：托管对账用，只认节点结论，不看任务行/媒体表
 */
function classifyHostMaskOutcome(row = {}, options = {}) {
  const nodeOnly = Boolean(options && options.nodeOnly)
  const tags = normalizeRiskTags(row.riskTags)
  const hasMaskedUrl = Boolean(String(row.maskedUrl || row.preMaskedUrl || '').trim())
  const assetStatus = String(row.status || '').trim()
  const mediaStatus = String(row.desensitizeStatus || '').trim()
  const explicit = normalizeOutcomeCode(row.maskOutcome)
  const regions = Array.isArray(row.maskRegions) ? row.maskRegions : null
  const hasRegions = Boolean(regions && regions.length) || (!nodeOnly && tags.length > 0)
  const needManual = Boolean(row.needManual) || (!nodeOnly && mediaStatus === 'need_manual')
  const stamp = { hasRegions, maskSource: row.maskSource }

  // 节点已写明结论：优先（真源）
  if (explicit === HOST_MASK_OUTCOME.OK_NO_PRIVACY) {
    return pack(HOST_MASK_OUTCOME.OK_NO_PRIVACY, { ...stamp, needsManual: false })
  }
  if (explicit === HOST_MASK_OUTCOME.OK_MASKED) {
    if (hasMaskedUrl) {
      return pack(HOST_MASK_OUTCOME.OK_MASKED, { ...stamp, needsManual: false })
    }
    // 标了已打码却无产物 → 按贴码失败重贴；无区域时会在 hostMaskAction 回退重跑模型
    return pack(HOST_MASK_OUTCOME.MASK_FAILED, { ...stamp, needsManual: true })
  }
  if (explicit === HOST_MASK_OUTCOME.MASK_FAILED) {
    return pack(HOST_MASK_OUTCOME.MASK_FAILED, { ...stamp, needsManual: true })
  }
  if (explicit === HOST_MASK_OUTCOME.LLM_FAILED) {
    return pack(HOST_MASK_OUTCOME.LLM_FAILED, { ...stamp, needsManual: true })
  }
  if (explicit === HOST_MASK_OUTCOME.NOT_ANALYZED) {
    return pack(HOST_MASK_OUTCOME.NOT_ANALYZED, { ...stamp, needsManual: false })
  }

  // 托管路径：节点没结论 = 未分析，禁止拿任务行/媒体表反推结论
  if (nodeOnly) {
    return pack(HOST_MASK_OUTCOME.NOT_ANALYZED, { ...stamp, needsManual: false })
  }

  if (needManual) {
    return pack(
      hasRegions || hasMaskedUrl
        ? HOST_MASK_OUTCOME.MASK_FAILED
        : HOST_MASK_OUTCOME.LLM_FAILED,
      { needsManual: true, hasRegions },
    )
  }

  // 旁路：媒体/任务行（仅非托管写回推断用；托管对账走 nodeOnly）
  if (mediaStatus === 'success') {
    if (hasMaskedUrl) {
      return pack(HOST_MASK_OUTCOME.OK_MASKED, { needsManual: false, hasRegions })
    }
    if (tags.length) {
      return pack(HOST_MASK_OUTCOME.MASK_FAILED, { needsManual: true, hasRegions })
    }
    return pack(HOST_MASK_OUTCOME.OK_NO_PRIVACY, { needsManual: false, hasRegions })
  }
  if (READY_ASSET_STATUSES.has(assetStatus)) {
    if (hasMaskedUrl) {
      return pack(
        tags.length ? HOST_MASK_OUTCOME.OK_MASKED : HOST_MASK_OUTCOME.OK_NO_PRIVACY,
        { needsManual: false, hasRegions },
      )
    }
    // 已结算且无产物、无风险标签 = 无须打码（可展示原图）
    if (!tags.length) {
      return pack(HOST_MASK_OUTCOME.OK_NO_PRIVACY, { needsManual: false, hasRegions })
    }
    return pack(HOST_MASK_OUTCOME.MASK_FAILED, { needsManual: true, hasRegions })
  }

  if (mediaStatus === 'failed' || assetStatus === 'mask_failed') {
    return pack(
      tags.length ? HOST_MASK_OUTCOME.MASK_FAILED : HOST_MASK_OUTCOME.LLM_FAILED,
      { needsManual: true, hasRegions },
    )
  }

  if (hasMaskedUrl && !assetStatus && !mediaStatus) {
    return pack(
      tags.length ? HOST_MASK_OUTCOME.OK_MASKED : HOST_MASK_OUTCOME.OK_NO_PRIVACY,
      { needsManual: false, hasRegions },
    )
  }

  return pack(HOST_MASK_OUTCOME.NOT_ANALYZED, { needsManual: false, hasRegions })
}

function isMaskCallSuccess(outcome) {
  const code = normalizeOutcomeCode(outcome)
  return (
    code === HOST_MASK_OUTCOME.OK_NO_PRIVACY || code === HOST_MASK_OUTCOME.OK_MASKED
  )
}

/**
 * @param {string} outcome
 * @param {{ hasRegions?: boolean }} [context] mask_failed 无区域时无法只重贴 → 回退跑模型
 * @returns {HostMaskAction}
 */
function hostMaskAction(outcome, context = {}) {
  const code = normalizeOutcomeCode(outcome)
  if (!code || code === HOST_MASK_OUTCOME.NOT_ANALYZED) return 'rerun_llm'
  // 大模型没跑通（含模型漏判这张）→ 重跑模型
  if (code === HOST_MASK_OUTCOME.LLM_FAILED) return 'rerun_llm'
  if (code === HOST_MASK_OUTCOME.MASK_FAILED) {
    // 有区域才只重贴；区域丢了只能重跑模型
    return context.hasRegions === false ? 'rerun_llm' : 'restamp'
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
  HOST_MASK_SOURCE,
  classifyHostMaskOutcome,
  isMaskCallSuccess,
  needsHostMaskAction,
  hostMaskAction,
  normalizeOutcomeCode,
  resolveHostDisplayUrl,
}
