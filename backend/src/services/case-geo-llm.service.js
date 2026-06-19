/**
 * GEO-CITE-C01/C05/C11 · 案例 GEO LLM 润色（异步；未采纳前不写公开稿）
 */
const fs = require('fs')
const path = require('path')
const { prisma } = require('../lib/prisma')
const { config } = require('../config')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { GEO_LLM_STATUS } = require('../constants/case-geo-llm-status')
const { CASE_ARTICLE_GENERATION_SOURCE } = require('../constants/case-article-status')
const { mergeContentJsonGeo } = require('../schemas/case-geo-content.schema')
const { buildCaseArticlePayload } = require('./case-article-generator.service')
const { buildAlbumView } = require('./service-album.service')
const {
  buildCaseDraft,
  buildNodesFromTask,
  resolvePublishTask,
} = require('./public-case.service')
const { findGeoLlmViolation, sanitizeGeoLlmText } = require('../constants/geo-llm-compliance')
const { verifyLlmDraftAgainstEvidence } = require('../utils/case-geo-llm-verify')
const { buildCaseGeoVisionDraft } = require('./case-geo-vision.service')
const { chatCompletion } = require('../lib/dashscope-chat')

const PROMPT_PATH = path.join(__dirname, '../prompts/case-geo-optimize.md')
const runningCases = new Set()

function getGeoLlmConfig() {
  const llm = config.geoLlm || {}
  const enabled = process.env.GEO_LLM_ENABLED === 'true' || llm.enabled === true
  const dryRun =
    process.env.GEO_LLM_DRY_RUN === 'true' || (!enabled && llm.dryRun !== false && !llm.enabled)
  return {
    enabled,
    dryRun,
    apiUrl: String(process.env.GEO_LLM_API_URL || llm.apiUrl || '').trim(),
    apiKey: String(process.env.GEO_LLM_API_KEY || llm.apiKey || process.env.DASHSCOPE_API_KEY || '').trim(),
    model: String(process.env.GEO_LLM_MODEL || llm.model || 'qwen3.6-plus').trim(),
    timeoutMs: Number(process.env.GEO_LLM_TIMEOUT_MS || llm.timeoutMs || 90000),
    enableThinking:
      process.env.GEO_LLM_ENABLE_THINKING === 'true' || llm.enableThinking === true,
  }
}

function readSystemPrompt() {
  try {
    return fs.readFileSync(PROMPT_PATH, 'utf8')
  } catch {
    return '你是汽车维修内容编辑，仅输出 JSON。'
  }
}

async function loadCaseLlmContext(caseId) {
  const row = await prisma.publicCase.findUnique({
    where: { id: caseId },
    include: {
      album: {
        include: {
          nodes: { orderBy: { sortOrder: 'asc' } },
          images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
          authorization: true,
        },
      },
    },
  })
  if (!row || !row.album) return null

  const album = row.album
  const task = await resolvePublishTask(row.albumId, {})
  const hasOwner =
    Boolean(String(album.userId || '').trim()) ||
    Boolean(String(album.userPhone || '').trim())
  const hasUserAuth = album.authorization?.status === 'authorized'
  const coldStart = !hasUserAuth && !hasOwner
  const albumView = buildAlbumView(album)
  const draft = buildCaseDraft(albumView, task, row.authorizationTier, {
    coldStart,
    hasUserAuthorization: hasUserAuth,
    serviceItemId: album.serviceItemId || '',
    templateId: album.templateId || '',
  })
  if (task && Array.isArray(draft.contentJson?.nodes)) {
    draft.contentJson.nodes = buildNodesFromTask(draft.contentJson.nodes, task)
  }

  const templatePayload = buildCaseArticlePayload({
    caseId: row.id,
    draft,
    albumView,
    coldStart,
    hasUserAuthorization: hasUserAuth,
    serviceItemId: album.serviceItemId || '',
    templateId: album.templateId || '',
    previousArticleVersion: row.articleVersion || 0,
  })

  return {
    row,
    album,
    albumView,
    draft,
    templatePayload,
    coldStart,
    nodes: draft.contentJson?.nodes || albumView.nodes || [],
  }
}

function buildUserPrompt(ctx) {
  const { templatePayload, albumView, nodes } = ctx
  const geo = templatePayload.contentJson?.geo || {}
  return JSON.stringify(
    {
      city: ctx.row.city,
      storeName: ctx.row.storeName,
      serviceName: ctx.row.serviceName,
      vehicle: albumView.vehicle || {},
      nodes: (nodes || []).map((node) => ({
        id: node.id || node.nodeId,
        title: node.title || '',
        note: node.note || '',
      })),
      templateBaseline: {
        aiSummary: templatePayload.aiSummary,
        faultDesc: geo.faultDesc,
        inspectResult: geo.inspectResult,
        repairPlan: geo.repairPlan,
        resultConfirm: geo.resultConfirm,
        seoTitle: templatePayload.seoTitle,
        seoDescription: templatePayload.seoDescription,
        articleBody: templatePayload.articleBody,
      },
    },
    null,
    2
  )
}

function parseLlmJson(text) {
  const raw = String(text || '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : raw
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new Error('LLM 输出非 JSON')
  }
  return JSON.parse(candidate.slice(start, end + 1))
}

function normalizeLlmDraft(raw) {
  const draft = raw && typeof raw === 'object' ? raw : {}
  const fields = [
    'aiSummary',
    'seoTitle',
    'seoDescription',
    'faultDesc',
    'inspectResult',
    'repairPlan',
    'resultConfirm',
    'articleBody',
  ]
  const normalized = {}
  for (const key of fields) {
    normalized[key] = sanitizeGeoLlmText(draft[key])
  }
  for (const key of fields) {
    const banned = findGeoLlmViolation(normalized[key])
    if (banned) {
      const err = new Error(`LLM 输出含不合规表述：${banned}`)
      err.code = 'GEO_LLM_COMPLIANCE'
      throw err
    }
  }
  normalized.missingEvidence = Array.isArray(draft.missingEvidence)
    ? draft.missingEvidence.map((item) => String(item || '').trim()).filter(Boolean)
    : []
  normalized.confidence = String(draft.confidence || 'medium').toLowerCase()
  return normalized
}

function buildDryRunDraft(ctx) {
  const base = ctx.templatePayload
  const geo = base.contentJson?.geo || {}
  const summary = String(base.aiSummary || '').trim()
  const polishedSummary = summary
    ? `${summary.replace(/。$/, '')}。以上内容基于门店脱敏记录整理，具体方案与费用以到店检测为准。`
    : '本案例为脱敏维修记录摘要，具体方案与费用以到店检测为准。'

  return normalizeLlmDraft({
    aiSummary: polishedSummary.slice(0, 280),
    seoTitle: base.seoTitle,
    seoDescription: base.seoDescription,
    faultDesc: geo.faultDesc,
    inspectResult: geo.inspectResult,
    repairPlan: geo.repairPlan,
    resultConfirm: geo.resultConfirm,
    articleBody: base.articleBody,
    missingEvidence: [],
    confidence: 'medium',
  })
}

async function callLlmApi(systemPrompt, userPrompt, llmConfig) {
  const result = await chatCompletion({
    apiUrl: llmConfig.apiUrl,
    apiKey: llmConfig.apiKey,
    model: llmConfig.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    responseFormat: { type: 'json_object' },
    enableThinking: llmConfig.enableThinking ? true : false,
    timeoutMs: llmConfig.timeoutMs,
  })
  return parseLlmJson(result.text)
}

async function patchGeoLlmState(caseId, patch) {
  const row = await prisma.publicCase.findUnique({
    where: { id: caseId },
    select: { contentJson: true },
  })
  if (!row) return
  const content =
    row.contentJson && typeof row.contentJson === 'object' ? { ...row.contentJson } : {}
  const nextContent = mergeContentJsonGeo(content, patch)
  await prisma.publicCase.update({
    where: { id: caseId },
    data: { contentJson: nextContent },
  })
}

/**
 * @param {string} caseId
 */
async function runCaseGeoLlmOptimization(caseId) {
  const llmConfig = getGeoLlmConfig()
  if (!llmConfig.enabled && !llmConfig.dryRun) {
    await patchGeoLlmState(caseId, { llmStatus: GEO_LLM_STATUS.SKIPPED })
    return { skipped: true, reason: 'disabled' }
  }

  if (runningCases.has(caseId)) {
    return { skipped: true, reason: 'in_progress' }
  }
  runningCases.add(caseId)

  try {
    const ctx = await loadCaseLlmContext(caseId)
    if (!ctx) {
      const err = new Error('案例不存在')
      err.status = 404
      throw err
    }
    if (ctx.row.status !== PUBLIC_CASE_STATUS.PENDING_REVIEW) {
      await patchGeoLlmState(caseId, { llmStatus: GEO_LLM_STATUS.SKIPPED })
      return { skipped: true, reason: 'not_pending_review' }
    }

    await patchGeoLlmState(caseId, {
      llmStatus: GEO_LLM_STATUS.GENERATING,
      llmError: '',
    })

    let rawDraft
    if (llmConfig.dryRun || !llmConfig.apiKey) {
      rawDraft = buildDryRunDraft(ctx)
    } else {
      rawDraft = await callLlmApi(readSystemPrompt(), buildUserPrompt(ctx), llmConfig)
    }

    const draft = normalizeLlmDraft(rawDraft)
    const visionDraft = await buildCaseGeoVisionDraft(ctx, draft)
    draft.nodeNarratives = visionDraft.nodeNarratives
    draft.visionSource = visionDraft.source
    const verify = verifyLlmDraftAgainstEvidence(draft, ctx.nodes, {
      serviceName: ctx.row.serviceName,
      city: ctx.row.city,
      storeName: ctx.row.storeName,
      planAmount: ctx.albumView.planAmount,
      storeNote: ctx.albumView.storeNote,
      coldStart: ctx.coldStart,
    })

    if (!verify.passed) {
      await patchGeoLlmState(caseId, {
        llmStatus: GEO_LLM_STATUS.FAILED,
        llmError: `校验未通过：${verify.unmappedFields.join(',') || '证据不足'}`,
        llmVerify: verify,
        llmDraft: null,
        llmGeneratedAt: new Date().toISOString(),
      })
      return { caseId, status: GEO_LLM_STATUS.FAILED, verify }
    }

    await patchGeoLlmState(caseId, {
      llmStatus: GEO_LLM_STATUS.READY,
      llmDraft: draft,
      llmVerify: verify,
      llmError: '',
      llmGeneratedAt: new Date().toISOString(),
    })

    return { caseId, status: GEO_LLM_STATUS.READY, draft }
  } catch (error) {
    await patchGeoLlmState(caseId, {
      llmStatus: GEO_LLM_STATUS.FAILED,
      llmError: String(error.message || error).slice(0, 500),
      llmGeneratedAt: new Date().toISOString(),
    })
    throw error
  } finally {
    runningCases.delete(caseId)
  }
}

function scheduleCaseGeoLlmOptimization(caseId) {
  const llmConfig = getGeoLlmConfig()
  if (!llmConfig.enabled && !llmConfig.dryRun) return
  setImmediate(() => {
    runCaseGeoLlmOptimization(caseId).catch((error) => {
      console.warn('[case-geo-llm] async failed', caseId, error.message)
    })
  })
}

const GEO_LLM_SKIP_ON_PRE_MASK = new Set([
  GEO_LLM_STATUS.ADOPTED,
  GEO_LLM_STATUS.REJECTED,
  GEO_LLM_STATUS.READY,
  GEO_LLM_STATUS.GENERATING,
])

/**
 * GEO-CITE-C05 · pre-mask 就绪后，为待审案例补调度 LLM（与提交审核触发去重）
 * @param {string} albumId
 * @param {{ trigger?: string }} [options]
 */
function scheduleCaseGeoLlmForAlbum(albumId, options = {}) {
  const llmConfig = getGeoLlmConfig()
  if (!llmConfig.enabled && !llmConfig.dryRun) return
  const aid = String(albumId || '').trim()
  if (!aid) return

  setImmediate(async () => {
    try {
      const row = await prisma.publicCase.findFirst({
        where: { albumId: aid, status: PUBLIC_CASE_STATUS.PENDING_REVIEW },
        select: { id: true, contentJson: true },
      })
      if (!row) return

      const llmStatus = String(row.contentJson?.geo?.llmStatus || '').trim()
      if (GEO_LLM_SKIP_ON_PRE_MASK.has(llmStatus)) return
      if (runningCases.has(row.id)) return

      console.info('[case-geo-llm] schedule from pre-mask', {
        albumId: aid,
        caseId: row.id,
        trigger: options.trigger || 'pre_mask_ready',
        llmStatus: llmStatus || 'empty',
      })
      scheduleCaseGeoLlmOptimization(row.id)
    } catch (error) {
      console.warn('[case-geo-llm] pre-mask schedule failed', aid, error.message)
    }
  })
}

function mapTemplateOriginal(templatePayload) {
  const geo = templatePayload.contentJson?.geo || {}
  return {
    aiSummary: templatePayload.aiSummary || '',
    seoTitle: templatePayload.seoTitle || '',
    seoDescription: templatePayload.seoDescription || '',
    faultDesc: geo.faultDesc || '',
    inspectResult: geo.inspectResult || '',
    repairPlan: geo.repairPlan || '',
    resultConfirm: geo.resultConfirm || '',
    articleBody: templatePayload.articleBody || '',
    nodeNarratives: geo.nodeNarratives || templatePayload.article?.nodeNarratives || [],
    generationSource: CASE_ARTICLE_GENERATION_SOURCE.TEMPLATE,
  }
}

module.exports = {
  getGeoLlmConfig,
  loadCaseLlmContext,
  runCaseGeoLlmOptimization,
  scheduleCaseGeoLlmOptimization,
  scheduleCaseGeoLlmForAlbum,
  mapTemplateOriginal,
  normalizeLlmDraft,
}
