/**
 * GEO-TOPIC-H05 · 咨询线索聚合 → OBS prompt 候选（默认不入 active 词库）
 */
const crypto = require('crypto')
const { prisma } = require('../lib/prisma')
const {
  buildLeadPromptCandidate,
  parseCityFromAddress,
} = require('../utils/geo-lead-prompt-desensitize')

const DEFAULT_MIN_COUNT = 2
const DEFAULT_DAYS = 30

function buildCandidateKey(input = {}) {
  const raw = [input.city, input.serviceName, input.fault, input.promptType]
    .map((item) => String(item || '').trim())
    .join('|')
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16)
}

function buildPromptIdFromKey(candidateKey) {
  return `prompt_lead_${candidateKey}`
}

function normalizePromptText(text) {
  return String(text || '').replace(/\s+/g, '').trim()
}

/**
 * @param {object[]} leads
 * @param {Map<string, object>} [storeMap]
 */
function aggregateLeadPromptCandidates(leads = [], storeMap = new Map()) {
  const buckets = new Map()

  leads.forEach((lead) => {
    const store = lead.storeId ? storeMap.get(lead.storeId) : null
    const city = parseCityFromAddress(store?.address || '')
    const vehicle = lead.vehicleJson && typeof lead.vehicleJson === 'object' ? lead.vehicleJson : {}
    const built = buildLeadPromptCandidate({
      serviceName: lead.serviceName,
      city,
      description: lead.description,
      vehicle,
    })
    if (!built.ok) return

    const candidateKey = buildCandidateKey({
      city,
      serviceName: lead.serviceName,
      fault: built.fault,
      promptType: built.promptType,
    })
    const bucket = buckets.get(candidateKey) || {
      candidateKey,
      promptId: buildPromptIdFromKey(candidateKey),
      prompt: built.prompt,
      city,
      service: lead.serviceName,
      fault: built.fault,
      promptType: built.promptType,
      source: 'lead_candidate',
      leadCount: 0,
      sampleLeadIds: [],
      latestAt: lead.createdAt,
      rejectReasons: [],
    }
    bucket.leadCount += 1
    if (bucket.sampleLeadIds.length < 5) bucket.sampleLeadIds.push(lead.id)
    if (lead.createdAt > bucket.latestAt) bucket.latestAt = lead.createdAt
    buckets.set(candidateKey, bucket)
  })

  return [...buckets.values()].sort((a, b) => b.leadCount - a.leadCount || b.latestAt - a.latestAt)
}

/**
 * @param {{ days?: number, minCount?: number, limit?: number }} [options]
 */
async function discoverLeadPromptCandidates(options = {}) {
  const days = Math.max(7, Number(options.days) || DEFAULT_DAYS)
  const minCount = Math.max(1, Number(options.minCount) || DEFAULT_MIN_COUNT)
  const limit = Math.min(Math.max(Number(options.limit) || 30, 1), 100)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const leads = await prisma.consultLead.findMany({
    where: {
      createdAt: { gte: since },
      description: { not: '' },
    },
    orderBy: { createdAt: 'desc' },
    take: 1000,
    select: {
      id: true,
      serviceName: true,
      description: true,
      vehicleJson: true,
      storeId: true,
      createdAt: true,
    },
  })

  const storeIds = [...new Set(leads.map((row) => row.storeId).filter(Boolean))]
  const stores = storeIds.length
    ? await prisma.store.findMany({
        where: { id: { in: storeIds } },
        select: { id: true, address: true },
      })
    : []
  const storeMap = new Map(stores.map((row) => [row.id, row]))

  const aggregated = aggregateLeadPromptCandidates(leads, storeMap).filter(
    (row) => row.leadCount >= minCount
  )

  const promptTexts = new Set(
    (
      await prisma.geoPromptProbe.findMany({
        select: { prompt: true },
      })
    ).map((row) => normalizePromptText(row.prompt))
  )

  const candidates = aggregated
    .map((row) => {
      const duplicateInProbe = promptTexts.has(normalizePromptText(row.prompt))
      return {
        ...row,
        duplicateInProbe,
        recommendedAction: duplicateInProbe ? 'skip_duplicate' : 'review',
      }
    })
    .slice(0, limit)

  return {
    periodDays: days,
    minCount,
    leadScanned: leads.length,
    candidateCount: candidates.length,
    disclaimer:
      '候选词由咨询描述脱敏聚合生成，仅供运营人工审查；批准前不会加入 active 探测词库，禁止录入手机号/车牌/完整对话。',
    candidates,
  }
}

module.exports = {
  DEFAULT_MIN_COUNT,
  DEFAULT_DAYS,
  buildCandidateKey,
  buildPromptIdFromKey,
  aggregateLeadPromptCandidates,
  discoverLeadPromptCandidates,
}
