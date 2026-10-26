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

/**
 * 单据链原料的 token
 *
 * 大模型现在主要依据 facts（单据链）写摘要，证据池必须包含这些原料，
 * 否则「右前小吊杆球头」这种真料写进摘要后，校验会发现证据池里没这个词，
 * 判成无出处打回——好摘要被自己人拦下来，白写。
 */
function collectFactTokens(factPack) {
  if (!factPack || !factPack.hasFlow) return []
  const parts = [
    factPack.chiefComplaint,
    factPack.vehicle && factPack.vehicle.brand,
    factPack.vehicle && factPack.vehicle.series,
  ]
  ;(factPack.findings || []).forEach((row) => {
    parts.push(row.partName, row.result, row.advice)
  })
  ;(factPack.quoteItems || []).forEach((name) => parts.push(name))
  ;(factPack.addonQuoteItems || []).forEach((name) => parts.push(name))
  ;(factPack.workItems || []).forEach((row) => {
    parts.push(row.name, row.note)
  })
  const finish = factPack.finish || {}
  parts.push(finish.conclusion, finish.warrantyPeriod, finish.warrantyNotes)
  const tokens = new Set()
  parts.forEach((part) => tokenize(part).forEach((t) => tokens.add(t)))
  return Array.from(tokens)
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
  collectFactTokens(options.factPack).forEach((t) => tokens.add(t))
  return { tokens, geo }
}

/**
 * 中文整句会被 tokenizer 切成一个 token
 * （如「检测发现右前小吊杆球头松旷」是一个整体），
 * 与证据池里的「右前小吊杆球头」永远不相等。
 * 只认全等的话，大模型任何改写都会被判成无出处——真料写的摘要被自己人拦下。
 * 所以这里改用包含匹配：证据词出现在文本词里就算命中。
 *
 * 这是原来全等匹配的**超集**：全等的一定包含，行为不回退。
 */
function tokenHitsEvidence(token, evidenceTokens) {
  if (evidenceTokens.has(token)) return true
  for (const candidate of evidenceTokens) {
    if (candidate.length < 2) continue
    if (token.includes(candidate)) return true
  }
  return false
}

function fieldHasEvidence(text, evidenceTokens) {
  const value = String(text || '').trim()
  if (!value) return true
  const fieldTokens = tokenize(value)
  if (!fieldTokens.length) return true
  const hits = fieldTokens.filter((t) => tokenHitsEvidence(t, evidenceTokens))
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
