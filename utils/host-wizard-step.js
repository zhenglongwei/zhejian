/** 托管向导：1 存档 · 2 核对内容 · 3 店页说明 */

function resolveWizardStep(hostMeta = {}, hostMode = 'private') {
  if (!hostMeta.hosted) return 1
  if (hostMeta.visibility === 'public') return 1
  const stage = String(hostMeta.publicPublishStage || '')
  if (!stage) return 1
  if (stage === 'awaiting_privacy') return 2
  if (stage === 'awaiting_geo' || stage === 'awaiting_geo_confirm') return 3
  if (stage === 'published') return 1
  if (hostMode === 'public') return 2
  return 1
}

/** 当前可点到的最远步：不可跳过未到达步；已上店页只留第 1 步管理 */
function resolveWizardMaxStep(hostMeta = {}, hostMode = 'private') {
  if (!hostMeta.hosted) return 1
  if (hostMeta.visibility === 'public') return 1
  const stage = String(hostMeta.publicPublishStage || '')
  if (stage === 'published') return 1
  if (stage === 'awaiting_geo' || stage === 'awaiting_geo_confirm') return 3
  if (stage === 'awaiting_privacy' || hostMode === 'public') return 2
  if (stage) return 2
  return 1
}

function canVisitWizardStep(step, maxStep) {
  const n = Number(step)
  const max = Number(maxStep)
  if (!Number.isInteger(n) || n < 1 || n > 3) return false
  if (!Number.isInteger(max) || max < 1) return false
  return n <= max
}

/** 从后面步退回再「继续」时：保留已生成/已改的店页说明，不重新抽 */
function shouldKeepExistingGeoDraft(data = {}) {
  const stage = String(data.publicPublishStage || '')
  if (stage === 'awaiting_geo' || stage === 'awaiting_geo_confirm') return true
  if (Number(data.wizardMaxStep) >= 3) return true
  return Boolean(String(data.geoSummary || '').trim())
}

module.exports = {
  resolveWizardStep,
  resolveWizardMaxStep,
  canVisitWizardStep,
  shouldKeepExistingGeoDraft,
}
