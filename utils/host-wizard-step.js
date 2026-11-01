/** 托管页落点：未托管停在选方式；已托管直接看预览。页内「下一步 / 上一步」不靠这里。 */

function resolveWizardStep(hostMeta = {}) {
  if (hostMeta && hostMeta.hosted) return 2
  return 1
}

/** 已托管可停在预览；未托管的预览是页内临时步，不从服务端放开 */
function resolveWizardMaxStep(hostMeta = {}) {
  if (hostMeta && hostMeta.hosted) return 2
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
