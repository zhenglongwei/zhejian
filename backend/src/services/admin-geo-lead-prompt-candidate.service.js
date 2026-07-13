/**
 * GEO-TOPIC-H05 · 运营审查咨询词 prompt 候选
 */
const { prisma } = require('../lib/prisma')
const { discoverLeadPromptCandidates, buildPromptIdFromKey } = require('./geo-lead-prompt-candidate.service')
const { createAdminGeoPrompt } = require('./admin-geo-prompt.service')

async function buildAdminLeadPromptCandidates(query = {}) {
  return discoverLeadPromptCandidates(query)
}

/**
 * @param {string} candidateKey
 * @param {{ active?: boolean }} [options]
 */
async function approveAdminLeadPromptCandidate(candidateKey, options = {}) {
  const key = String(candidateKey || '').trim()
  if (!key) {
    const err = new Error('candidateKey 不能为空')
    err.status = 400
    throw err
  }

  const report = await discoverLeadPromptCandidates({ minCount: 1, limit: 200 })
  const candidate = report.candidates.find((row) => row.candidateKey === key)
  if (!candidate) {
    const err = new Error('未找到匹配的咨询词候选')
    err.status = 404
    throw err
  }
  if (candidate.duplicateInProbe) {
    const err = new Error('该候选与现有词库重复，无需重复入库')
    err.status = 409
    throw err
  }

  const promptId = candidate.promptId || buildPromptIdFromKey(key)
  const existing = await prisma.geoPromptProbe.findUnique({ where: { promptId } })
  if (existing) {
    const err = new Error('promptId 已存在')
    err.status = 409
    err.data = existing
    throw err
  }

  const created = await createAdminGeoPrompt({
    promptId,
    prompt: candidate.prompt,
    city: candidate.city,
    service: candidate.service,
    fault: candidate.fault,
    pageType: candidate.promptType === 'C' ? 'vehicle_service' : 'fault_qa',
    promptType: candidate.promptType,
    source: 'lead_candidate',
    active: options.active !== false,
  })

  return {
    approved: true,
    candidateKey: key,
    prompt: created,
    note: '已入库为 OBS prompt；建议 7 日内对该词加跑探测（Tier 0 事件）。',
  }
}

module.exports = {
  buildAdminLeadPromptCandidates,
  approveAdminLeadPromptCandidate,
}
