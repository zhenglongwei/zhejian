/** 托管向导：1 存档 · 2 预览公开（打码后网页稿 → 协议 → 直公开） */

function resolveWizardStep(hostMeta = {}, hostMode = 'private') {
  if (!hostMeta.hosted) return 1
  if (hostMeta.visibility === 'public') return 1
  const stage = String(hostMeta.publicPublishStage || '')
  if (!stage) return 1
  if (stage === 'published') return 1
  // 公开意图下统一进预览步（含旧 awaiting_geo*）
  if (
    stage === 'awaiting_privacy' ||
    stage === 'awaiting_geo' ||
    stage === 'awaiting_geo_confirm' ||
    hostMode === 'public'
  ) {
    return 2
  }
  return 1
}

/** 当前可点到的最远步；已上店页只留第 1 步管理 */
function resolveWizardMaxStep(hostMeta = {}, hostMode = 'private') {
  if (!hostMeta.hosted) return 1
  if (hostMeta.visibility === 'public') return 1
  const stage = String(hostMeta.publicPublishStage || '')
  if (stage === 'published') return 1
  if (
    stage === 'awaiting_privacy' ||
    stage === 'awaiting_geo' ||
    stage === 'awaiting_geo_confirm' ||
    hostMode === 'public' ||
    stage
  ) {
    return 2
  }
  return 1
}

function canVisitWizardStep(step, maxStep) {
  const n = Number(step)
  const max = Number(maxStep)
  if (!Number.isInteger(n) || n < 1 || n > 2) return false
  if (!Number.isInteger(max) || max < 1) return false
  return n <= max
}

/** 预览步已有店页草稿时，公开前不必强制重抽 */
function shouldKeepExistingGeoDraft(data = {}) {
  const stage = String(data.publicPublishStage || '')
  if (stage === 'awaiting_geo' || stage === 'awaiting_geo_confirm' || stage === 'awaiting_privacy') {
    return Boolean(String(data.geoSummary || '').trim())
  }
  if (Number(data.wizardMaxStep) >= 2) return Boolean(String(data.geoSummary || '').trim())
  return Boolean(String(data.geoSummary || '').trim())
}

module.exports = {
  resolveWizardStep,
  resolveWizardMaxStep,
  canVisitWizardStep,
  shouldKeepExistingGeoDraft,
}
