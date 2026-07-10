/**
 * CASE-MCH-01～04 · 商家授权前相册内容优化（规则 / 299 LLM）
 */
const fs = require('fs')
const path = require('path')
const { prisma } = require('../lib/prisma')
const { config } = require('../config')
const { SERVICE_ALBUM_STATUS } = require('../constants/v2')
const {
  buildAlbumView,
  isAlbumContentLocked,
  canAccessMerchantAlbum,
} = require('./service-album.service')
const { buildAlbumGeoPreview } = require('./album-geo-preview.service')
const { getMerchantSubscription, resolveMerchantContentOptimizeCapability } = require('./merchant-subscription.service')
const {
  OPTIMIZE_STATUS,
  OPTIMIZE_SOURCE,
  normalizeAlbumContentOptimizeDraft,
  extractAlbumContentOptimizeDraft,
} = require('../schemas/album-content-optimize.schema')
const { mergeContentJsonGeo } = require('../schemas/case-geo-content.schema')
const { findGeoLlmViolation, sanitizeGeoLlmText } = require('../constants/geo-llm-compliance')
const { chatCompletion } = require('../lib/dashscope-chat')
const { CASE_ARTICLE_GENERATION_SOURCE } = require('../constants/case-article-status')

const PROMPT_PATH = path.join(__dirname, '../prompts/case-geo-optimize.md')
const STAGE_GEO_FIELD = {
  stage_1: 'faultDesc',
  stage_2: 'inspectResult',
  stage_3: 'repairPlan',
  stage_6: 'resultConfirm',
}

function getGeoLlmConfig() {
  const llm = config.geoLlm || {}
  const enabled = process.env.GEO_LLM_ENABLED === 'true' || llm.enabled === true
  const dryRun =
    process.env.GEO_LLM_DRY_RUN === 'true' || (!enabled && llm.dryRun !== false && !llm.enabled)
  return {
    enabled,
    dryRun,
    apiKey: String(process.env.GEO_LLM_API_KEY || llm.apiKey || process.env.DASHSCOPE_API_KEY || '').trim(),
    model: String(process.env.GEO_LLM_MODEL || llm.model || 'qwen3.6-plus').trim(),
    timeoutMs: Number(process.env.GEO_LLM_TIMEOUT_MS || llm.timeoutMs || 90000),
  }
}

function readSystemPrompt() {
  try {
    return fs.readFileSync(PROMPT_PATH, 'utf8')
  } catch {
    return '你是汽车维修内容编辑，仅输出 JSON，禁止编造事实。'
  }
}

function assertMerchantCanOptimizeAlbum(album) {
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  if (isAlbumContentLocked(album)) {
    const err = new Error('车主已授权，相册内容已锁定，不可再优化')
    err.status = 409
    err.code = 'ALBUM_CONTENT_LOCKED'
    throw err
  }
  const completed =
    album.status === SERVICE_ALBUM_STATUS.COMPLETED ||
    album.status === SERVICE_ALBUM_STATUS.PUBLISHED ||
    album.status === 'published'
  if (!completed) {
    const err = new Error('请先标记相册完工后再优化内容')
    err.status = 409
    throw err
  }
}

async function loadMerchantAlbum(albumId, storeId, merchantId) {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
      images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
      authorization: true,
      publicCase: true,
    },
  })
  if (!canAccessMerchantAlbum(album, merchantId)) {
    const err = new Error('相册不存在或无权访问')
    err.status = 404
    throw err
  }
  assertMerchantCanOptimizeAlbum(album)
  return album
}

function buildNodeNotesFromGeo(geo = {}, nodes = []) {
  const out = {}
  ;(nodes || []).forEach((node) => {
    const id = node.id || node.nodeId
    const field = STAGE_GEO_FIELD[id]
    if (!field) return
    const note = String(geo[field] || '').trim()
    if (note) out[id] = note
  })
  return out
}

function buildRuleOptimizeDraft(albumView, capability) {
  const preview = buildAlbumGeoPreview(albumView, { coldStart: false })
  const suggestions = (preview.geoQuality?.warnings || []).map((text) => ({
    type: 'tip',
    text: String(text),
  }))
  if (preview.geoQuality?.missingFields?.length) {
    preview.geoQuality.missingFields.forEach((field) => {
      suggestions.push({
        type: 'warn',
        text: `建议补充：${field}`,
      })
    })
  }
  if (capability.mode === 'rule') {
    suggestions.unshift({
      type: 'info',
      text:
        capability.plan === 'index_99' || capability.plan === 'optimize_299'
          ? '当前为标准版：可使用规则建议优化文案（授权前，商家确认后写入相册）。'
          : '当前为免费版：提供规则建议；开通标准版后可公域收录。',
    })
  }

  const geo = preview.geo || {}
  const nodeNotes = buildNodeNotesFromGeo(geo, albumView.nodes)

  return normalizeAlbumContentOptimizeDraft({
    version: 1,
    updatedAt: new Date().toISOString(),
    status: OPTIMIZE_STATUS.READY,
    source: OPTIMIZE_SOURCE.RULE,
    plan: capability.plan,
    aiSummary: preview.aiSummaryPreview || '',
    geo: {
      faultDesc: geo.faultDesc,
      inspectResult: geo.inspectResult,
      repairPlan: geo.repairPlan,
      resultConfirm: geo.resultConfirm,
    },
    nodeNotes,
    suggestions,
    generationSource: CASE_ARTICLE_GENERATION_SOURCE.TEMPLATE,
  })
}

function parseLlmJson(text) {
  const raw = String(text || '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1].trim() : raw
  return JSON.parse(body)
}

async function buildLlmOptimizeDraft(albumView, capability) {
  const cfg = getGeoLlmConfig()
  if (cfg.dryRun || !cfg.apiKey) {
    const fallback = buildRuleOptimizeDraft(albumView, { ...capability, mode: 'rule' })
    return {
      ...fallback,
      source: OPTIMIZE_SOURCE.LLM_V1,
      suggestions: [
        { type: 'info', text: 'LLM 未配置，已回落规则建议稿。' },
        ...(fallback.suggestions || []),
      ],
    }
  }

  const userPrompt = JSON.stringify({
    city: albumView.store?.city || '',
    storeName: albumView.store?.name || albumView.storeName || '',
    serviceName: albumView.serviceName || '',
    vehicle: albumView.vehicle || {},
    storeNote: albumView.storeNote || '',
    nodes: (albumView.nodes || []).map((node) => ({
      id: node.id || node.nodeId,
      title: node.title || '',
      note: node.note || '',
    })),
    task: 'merchant_album_optimize_draft',
  })

  const completion = await chatCompletion({
    apiKey: cfg.apiKey,
    model: cfg.model,
    timeoutMs: cfg.timeoutMs,
    messages: [
      { role: 'system', content: readSystemPrompt() },
      { role: 'user', content: userPrompt },
    ],
  })

  const parsed = parseLlmJson(completion.content)
  const geo = {
    faultDesc: sanitizeGeoLlmText(parsed.faultDesc || parsed.geo?.faultDesc || ''),
    inspectResult: sanitizeGeoLlmText(parsed.inspectResult || parsed.geo?.inspectResult || ''),
    repairPlan: sanitizeGeoLlmText(parsed.repairPlan || parsed.geo?.repairPlan || ''),
    resultConfirm: sanitizeGeoLlmText(parsed.resultConfirm || parsed.geo?.resultConfirm || ''),
  }
  const aiSummary = sanitizeGeoLlmText(parsed.aiSummary || parsed.summary || '')
  const violation = findGeoLlmViolation(
    [aiSummary, geo.faultDesc, geo.inspectResult, geo.repairPlan, geo.resultConfirm].join('\n')
  )
  if (violation) {
    const err = new Error(`LLM 输出含违规表述：${violation}`)
    err.status = 422
    throw err
  }

  const nodeNotes = buildNodeNotesFromGeo(geo, albumView.nodes)
  return normalizeAlbumContentOptimizeDraft({
    version: 1,
    updatedAt: new Date().toISOString(),
    status: OPTIMIZE_STATUS.READY,
    source: OPTIMIZE_SOURCE.LLM_V1,
    plan: capability.plan,
    aiSummary,
    geo,
    nodeNotes,
    suggestions: [{ type: 'info', text: '以下为 AI 深度润色建议，请核对后采用。' }],
    generationSource: CASE_ARTICLE_GENERATION_SOURCE.LLM_V1,
  })
}

async function generateAlbumContentOptimizeDraft(albumId, storeId, merchantId) {
  const album = await loadMerchantAlbum(albumId, storeId, merchantId)
  const albumView = buildAlbumView(album)
  const subscription = await getMerchantSubscription(merchantId)
  const capability = resolveMerchantContentOptimizeCapability(subscription)

  let draft
  try {
    if (capability.llmEnabled) {
      draft = await buildLlmOptimizeDraft(albumView, capability)
    } else {
      draft = buildRuleOptimizeDraft(albumView, capability)
    }
  } catch (e) {
    const failed = normalizeAlbumContentOptimizeDraft({
      version: 1,
      updatedAt: new Date().toISOString(),
      status: OPTIMIZE_STATUS.FAILED,
      source: capability.llmEnabled ? OPTIMIZE_SOURCE.LLM_V1 : OPTIMIZE_SOURCE.RULE,
      plan: capability.plan,
      error: e.message || '生成失败',
    })
    await prisma.album.update({
      where: { id: albumId },
      data: { contentOptimizeDraftJson: failed },
    })
    throw e
  }

  await prisma.album.update({
    where: { id: albumId },
    data: { contentOptimizeDraftJson: draft },
  })

  return {
    capability,
    draft,
    preview: buildAlbumGeoPreview(albumView, { coldStart: false }),
  }
}

async function fetchAlbumContentOptimizePanel(albumId, storeId, merchantId) {
  const album = await loadMerchantAlbum(albumId, storeId, merchantId)
  const albumView = buildAlbumView(album)
  const subscription = await getMerchantSubscription(merchantId)
  const capability = resolveMerchantContentOptimizeCapability(subscription)
  const draft = extractAlbumContentOptimizeDraft(album)
  const preview = buildAlbumGeoPreview(albumView, { coldStart: false })

  return {
    albumId,
    capability,
    draft,
    preview: {
      aiSummaryPreview: preview.aiSummaryPreview,
      geo: preview.geoPreview,
      geoQuality: preview.geoQuality,
    },
    canOptimize: true,
    isAuthorized: album.authorization?.status === 'authorized',
  }
}

async function applyAlbumContentOptimizeDraft(albumId, storeId, merchantId) {
  const album = await loadMerchantAlbum(albumId, storeId, merchantId)
  const draft = extractAlbumContentOptimizeDraft(album)
  if (!draft || draft.status === OPTIMIZE_STATUS.FAILED) {
    const err = new Error('请先生成内容优化建议')
    err.status = 409
    throw err
  }

  const nodeNotes = draft.nodeNotes || {}
  const updates = []
  for (const node of album.nodes || []) {
    const note = nodeNotes[node.nodeId]
    if (!note) continue
    updates.push(
      prisma.albumNode.update({
        where: { albumId_nodeId: { albumId, nodeId: node.nodeId } },
        data: { note },
      })
    )
  }

  const appliedDraft = normalizeAlbumContentOptimizeDraft({
    ...draft,
    status: OPTIMIZE_STATUS.APPLIED,
    appliedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  await prisma.$transaction([
    ...updates,
    prisma.album.update({
      where: { id: albumId },
      data: { contentOptimizeDraftJson: appliedDraft },
    }),
  ])

  const refreshed = await loadMerchantAlbum(albumId, storeId, merchantId)
  return {
    albumId,
    draft: appliedDraft,
    album: buildAlbumView(refreshed),
  }
}

/**
 * CASE-MCH-04 · 授权快照构建时合并优化草稿（未 apply 也写入 snapshot）
 * @param {object} draft buildCaseDraft 结果
 * @param {object|null} optimizeDraft
 */
function mergeOptimizeDraftIntoCaseDraft(draft, optimizeDraft) {
  if (!draft || !optimizeDraft) return draft
  if (
    optimizeDraft.status !== OPTIMIZE_STATUS.READY &&
    optimizeDraft.status !== OPTIMIZE_STATUS.APPLIED
  ) {
    return draft
  }

  const nodes = (draft.contentJson?.nodes || []).map((node) => {
    const id = node.id || node.nodeId
    const patch = optimizeDraft.nodeNotes?.[id]
    if (!patch) return node
    return { ...node, note: patch }
  })

  const contentJson = mergeContentJsonGeo(
    {
      ...(draft.contentJson || {}),
      nodes,
      contentOptimizeAppliedAt: optimizeDraft.appliedAt || optimizeDraft.updatedAt || '',
      contentOptimizeSource: optimizeDraft.source || OPTIMIZE_SOURCE.RULE,
    },
    optimizeDraft.geo || {}
  )

  return {
    ...draft,
    summary: optimizeDraft.aiSummary || draft.summary,
    contentJson,
  }
}

function summarizeOptimizeDraftForApi(album) {
  const draft = extractAlbumContentOptimizeDraft(album)
  if (!draft) return null
  return {
    status: draft.status,
    source: draft.source,
    plan: draft.plan,
    updatedAt: draft.updatedAt,
    appliedAt: draft.appliedAt,
    hasDraft: true,
  }
}

module.exports = {
  assertMerchantCanOptimizeAlbum,
  generateAlbumContentOptimizeDraft,
  fetchAlbumContentOptimizePanel,
  applyAlbumContentOptimizeDraft,
  mergeOptimizeDraftIntoCaseDraft,
  summarizeOptimizeDraftForApi,
  buildRuleOptimizeDraft,
  buildNodeNotesFromGeo,
}
