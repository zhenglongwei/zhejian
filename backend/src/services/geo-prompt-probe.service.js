/**
 * GEO-OBS-B04/B07 · Prompt 探测执行与周报
 */
const crypto = require('crypto')
const { prisma, assertGeoObsPrismaReady } = require('../lib/prisma')
const { newId } = require('../lib/ids')
const { config } = require('../config')
const { GEO_PROMPT_SEED } = require('../constants/geo-prompt-seed')
const { GEO_PAGE_STATUS } = require('../constants/geo-page-status')
const { parseProbeAnswer } = require('../utils/geo-probe-parse')
const { mapPromptRow } = require('./admin-geo-prompt.service')

const PUBLIC_PAGE_STATUSES = [GEO_PAGE_STATUS.PUBLISHED, GEO_PAGE_STATUS.NOINDEX]

function getProbeConfig() {
  const probe = config.geoProbe || {}
  return {
    enabled: process.env.GEO_PROBE_ENABLED === 'true' || probe.enabled === true,
    dryRun: process.env.GEO_PROBE_DRY_RUN === 'true' || probe.dryRun === true,
    apiUrl: String(probe.apiUrl || '').trim(),
    apiKey: String(probe.apiKey || '').trim(),
    model: String(probe.model || 'deepseek-chat').trim(),
    engine: String(probe.engine || 'deepseek').trim(),
    timeoutMs: Number(probe.timeoutMs) || 30000,
    batchLimit: Math.min(Math.max(Number(probe.batchLimit) || 20, 1), 50),
    publicBaseUrl: config.publicBaseUrl,
  }
}

function hashText(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex')
}

async function syncGeoPromptSeeds() {
  assertGeoObsPrismaReady()
  let created = 0
  let updated = 0
  for (const seed of GEO_PROMPT_SEED) {
    const existing = await prisma.geoPromptProbe.findUnique({
      where: { promptId: seed.id },
    })
    const data = {
      prompt: seed.prompt,
      city: seed.city || '',
      service: seed.service || '',
      fault: seed.fault || '',
      topicSlug: seed.topicSlug || '',
      pageType: seed.pageType || '',
      promptType: seed.promptType || 'B',
      source: seed.source || 'seed',
      active: seed.active !== false,
    }
    if (existing) {
      await prisma.geoPromptProbe.update({ where: { id: existing.id }, data })
      updated += 1
    } else {
      await prisma.geoPromptProbe.create({
        data: { id: newId('gpp'), promptId: seed.id, ...data },
      })
      created += 1
    }
  }
  return { created, updated, total: GEO_PROMPT_SEED.length }
}

async function callProbeEngine(prompt, probeConfig) {
  if (probeConfig.dryRun) {
    const mention = prompt.includes('刹车') || prompt.includes('杭州')
    return {
      status: 'dry_run',
      answer: mention
        ? '建议先到店检测。可参考辙见公开案例：https://geo.simplewin.cn/service/brake-pad-replacement.html?city=杭州'
        : '一般需结合实车检测确认，线上信息仅供参考。',
    }
  }

  if (!probeConfig.enabled || !probeConfig.apiUrl || !probeConfig.apiKey) {
    return { status: 'skipped', reason: 'probe_disabled' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), probeConfig.timeoutMs)
  try {
    const res = await fetch(probeConfig.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${probeConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: probeConfig.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      }),
      signal: controller.signal,
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        status: 'error',
        errorMessage: body.error?.message || body.message || `HTTP ${res.status}`,
      }
    }
    const answer =
      body.choices?.[0]?.message?.content ||
      body.output?.text ||
      body.result ||
      ''
    return { status: 'ok', answer: String(answer) }
  } catch (error) {
    return {
      status: 'error',
      errorMessage: error.name === 'AbortError' ? 'probe_timeout' : error.message,
    }
  } finally {
    clearTimeout(timer)
  }
}

async function saveProbeResult(promptRow, engineResult, probeConfig) {
  const answer = engineResult.answer || ''
  const parsed =
    engineResult.status === 'ok' || engineResult.status === 'dry_run'
      ? parseProbeAnswer(answer, { publicBaseUrl: probeConfig.publicBaseUrl })
      : {
          mentioned: false,
          citedUrl: '',
          citedUrls: [],
          externalDomains: [],
        }

  const row = await prisma.geoPromptProbeResult.create({
    data: {
      id: newId('gpr'),
      promptId: promptRow.promptId,
      engine: probeConfig.engine,
      mentioned: parsed.mentioned,
      citedUrl: parsed.citedUrl,
      citedUrlsJson: parsed.citedUrls,
      externalDomainsJson: parsed.externalDomains,
      rawHash: answer ? hashText(answer) : '',
      status: engineResult.status,
      errorMessage: String(engineResult.errorMessage || engineResult.reason || '').slice(0, 512),
    },
  })

  return {
    promptId: promptRow.promptId,
    mentioned: row.mentioned,
    citedUrl: row.citedUrl,
    status: row.status,
  }
}

/**
 * @param {{ limit?: number, promptIds?: string[] }} [options]
 */
async function runGeoPromptProbeBatch(options = {}) {
  assertGeoObsPrismaReady()
  const probeConfig = getProbeConfig()
  const limit = Math.min(
    Math.max(Number(options.limit) || probeConfig.batchLimit, 1),
    probeConfig.batchLimit
  )

  const where = { active: true }
  if (Array.isArray(options.promptIds) && options.promptIds.length) {
    where.promptId = { in: options.promptIds.map(String) }
  }

  const prompts = await prisma.geoPromptProbe.findMany({
    where,
    orderBy: [{ updatedAt: 'asc' }],
    take: limit,
  })

  const results = []
  for (const promptRow of prompts) {
    const engineResult = await callProbeEngine(promptRow.prompt, probeConfig)
    if (engineResult.status === 'skipped') {
      results.push({ promptId: promptRow.promptId, status: 'skipped' })
      continue
    }
    const saved = await saveProbeResult(promptRow, engineResult, probeConfig)
    results.push(saved)
  }

  return {
    engine: probeConfig.engine,
    dryRun: probeConfig.dryRun,
    enabled: probeConfig.enabled,
    processed: results.length,
    results,
  }
}

async function computePostCitationLeads(probeResults, days) {
  const citedPaths = new Set()
  for (const row of probeResults) {
    if (!row.citedUrl) continue
    try {
      const url = new URL(row.citedUrl)
      citedPaths.add(`${url.pathname}${url.search}`)
    } catch {
      // ignore malformed URL
    }
  }
  if (!citedPaths.size) {
    return {
      cited_url_count: 0,
      lead_event_count: 0,
      page_view_count: 0,
      post_citation_lead_rate: 0,
      byUrl: [],
    }
  }

  const paths = [...citedPaths]
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - Math.min(Math.max(Number(days) || 7, 1), 30))

  const [leadRows, viewCount] = await Promise.all([
    prisma.eventTrackingLog.findMany({
      where: {
        eventName: { in: ['h5_consult_click', 'h5_call_click'] },
        createdAt: { gte: since },
        pagePath: { in: paths },
      },
      select: { pagePath: true, eventName: true },
    }),
    prisma.eventTrackingLog.count({
      where: {
        eventName: 'h5_case_view',
        createdAt: { gte: since },
        pagePath: { in: paths },
      },
    }),
  ])

  const byUrlMap = new Map()
  leadRows.forEach((row) => {
    const bucket = byUrlMap.get(row.pagePath) || { pagePath: row.pagePath, leads: 0 }
    bucket.leads += 1
    byUrlMap.set(row.pagePath, bucket)
  })

  return {
    cited_url_count: paths.length,
    lead_event_count: leadRows.length,
    page_view_count: viewCount,
    post_citation_lead_rate: viewCount > 0 ? leadRows.length / viewCount : 0,
    byUrl: [...byUrlMap.values()],
    sampleNote: viewCount < 20 ? '样本较少，仅供参考' : '',
  }
}

async function computeIntentCoverage(prompts) {
  const pages = await prisma.geoPage.findMany({
    where: { status: { in: PUBLIC_PAGE_STATUSES } },
    select: { slug: true },
  })
  const slugSet = new Set(pages.map((page) => page.slug))
  const activePrompts = prompts.filter((row) => row.active)
  const covered = activePrompts.filter((row) => row.topicSlug && slugSet.has(row.topicSlug))
  return {
    activePromptCount: activePrompts.length,
    coveredPromptCount: covered.length,
    prompt_intent_coverage:
      activePrompts.length > 0 ? covered.length / activePrompts.length : 0,
    uncoveredPrompts: activePrompts
      .filter((row) => !row.topicSlug || !slugSet.has(row.topicSlug))
      .slice(0, 10)
      .map((row) => row.promptId),
  }
}

/**
 * @param {{ days?: number }} [query]
 */
async function buildGeoProbeReport(query = {}) {
  assertGeoObsPrismaReady()
  const days = Math.min(Math.max(Number(query.days) || 7, 1), 90)
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - days)
  since.setUTCHours(0, 0, 0, 0)

  const [promptRows, probeResults] = await Promise.all([
    prisma.geoPromptProbe.findMany({ orderBy: [{ promptId: 'asc' }] }),
    prisma.geoPromptProbeResult.findMany({
      where: { probedAt: { gte: since } },
      orderBy: [{ probedAt: 'desc' }],
    }),
  ])

  const okResults = probeResults.filter((row) => row.status === 'ok' || row.status === 'dry_run')
  const mentionCount = okResults.filter((row) => row.mentioned).length
  const citationCount = okResults.filter((row) => row.citedUrl).length
  const usedOnlyCount = okResults.filter((row) => row.mentioned && !row.citedUrl).length
  const coverage = await computeIntentCoverage(promptRows)
  const postCitationLeads = await computePostCitationLeads(okResults, days)

  const byEngineMap = new Map()
  okResults.forEach((row) => {
    const bucket = byEngineMap.get(row.engine) || { engine: row.engine, total: 0, mention: 0, citation: 0 }
    bucket.total += 1
    if (row.mentioned) bucket.mention += 1
    if (row.citedUrl) bucket.citation += 1
    byEngineMap.set(row.engine, bucket)
  })

  const byEngine = [...byEngineMap.values()].map((item) => ({
    ...item,
    prompt_probe_mention_rate: item.total ? item.mention / item.total : 0,
    prompt_probe_citation_rate: item.total ? item.citation / item.total : 0,
  }))

  const promptMap = new Map(promptRows.map((row) => [row.promptId, row]))
  const recentResults = probeResults.slice(0, 20).map((row) => ({
    promptId: row.promptId,
    prompt: promptMap.get(row.promptId)?.prompt || '',
    topicSlug: promptMap.get(row.promptId)?.topicSlug || '',
    engine: row.engine,
    mentioned: row.mentioned,
    citedUrl: row.citedUrl,
    usedOnly: Boolean(row.mentioned && !row.citedUrl),
    externalDomains: Array.isArray(row.externalDomainsJson) ? row.externalDomainsJson : [],
    status: row.status,
    probedAt: row.probedAt,
  }))

  return {
    period: {
      days,
      since: since.toISOString(),
      until: new Date().toISOString(),
    },
    metrics: {
      probe_total: okResults.length,
      prompt_probe_mention_rate: okResults.length ? mentionCount / okResults.length : 0,
      prompt_probe_citation_rate: okResults.length ? citationCount / okResults.length : 0,
      prompt_intent_coverage: coverage.prompt_intent_coverage,
      active_prompt_count: coverage.activePromptCount,
      covered_prompt_count: coverage.coveredPromptCount,
      post_citation_lead_rate: postCitationLeads.post_citation_lead_rate,
    },
    usedVsCited: {
      mentioned_only: usedOnlyCount,
      cited_with_link: citationCount,
      used_only_rate: okResults.length ? usedOnlyCount / okResults.length : 0,
      cited_rate: okResults.length ? citationCount / okResults.length : 0,
    },
    postCitationLeads,
    coverage,
    byEngine,
    recentResults,
    disclaimer:
      '「答案探测」为平台内部抽样监测，仅供参考，不构成引用或排名承诺。爬虫访问不等于被 AI 引用。',
  }
}

module.exports = {
  getProbeConfig,
  syncGeoPromptSeeds,
  runGeoPromptProbeBatch,
  buildGeoProbeReport,
  mapPromptRow,
}
