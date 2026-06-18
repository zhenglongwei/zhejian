/**
 * GEO-CITE-C04 · LLM 输出事实溯源校验
 */
const { extractGeoFromAlbumNodes } = require('./album-geo-extract')

function tokenize(text) {
  return String(text || '')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
}

function collectEvidenceTokens(nodes, options = {}) {
  const geo = extractGeoFromAlbumNodes(nodes, options)
  const parts = [
    geo.faultDesc,
    geo.inspectResult,
    geo.repairPlan,
    geo.resultConfirm,
    geo.storeNote,
    options.serviceName,
    options.city,
    options.storeName,
  ]
  ;(nodes || []).forEach((node) => {
    if (node?.note) parts.push(node.note)
    if (node?.title) parts.push(node.title)
  })
  const tokens = new Set()
  parts.forEach((part) => {
    tokenize(part).forEach((t) => tokens.add(t))
  })
  return { tokens, geo }
}

function fieldHasEvidence(text, evidenceTokens) {
  const value = String(text || '').trim()
  if (!value) return true
  const fieldTokens = tokenize(value)
  if (!fieldTokens.length) return true
  const hits = fieldTokens.filter((t) => evidenceTokens.has(t))
  return hits.length >= Math.min(2, fieldTokens.length)
}

/**
 * @param {object} draft LLM 输出
 * @param {object[]} nodes
 * @param {object} [options]
 */
function verifyLlmDraftAgainstEvidence(draft, nodes, options = {}) {
  const { tokens, geo } = collectEvidenceTokens(nodes, options)
  const fields = [
    'aiSummary',
    'faultDesc',
    'inspectResult',
    'repairPlan',
    'resultConfirm',
    'articleBody',
  ]
  const unmappedFields = []
  for (const key of fields) {
    if (!fieldHasEvidence(draft[key], tokens)) {
      unmappedFields.push(key)
    }
  }

  const missingEvidence = Array.isArray(draft.missingEvidence) ? draft.missingEvidence : []
  const confidence = String(draft.confidence || '').toLowerCase()
  const degraded =
    unmappedFields.length > 0 ||
    confidence === 'low' ||
    (missingEvidence.length > 0 && !draft.aiSummary)

  return {
    passed: !degraded,
    unmappedFields,
    missingEvidence,
    confidence: confidence || (degraded ? 'low' : 'medium'),
    baselineGeo: geo,
  }
}

module.exports = {
  verifyLlmDraftAgainstEvidence,
  collectEvidenceTokens,
}
