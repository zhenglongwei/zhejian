/**
 * 节点确认前检查：增量打码 + 规则/模型建议，不硬拦
 * 真源：docs/04_维修过程相册/28_ · 26_ 确认前检查
 */
const crypto = require('crypto')
const { prisma } = require('../lib/prisma')
const { config } = require('../config')
const { stripUrlQuery } = require('../lib/media-signed-url')
const {
  resolveNodeAiReviewCapability,
  publicNodeAiReviewCapability,
} = require('../utils/node-ai-review-capability')
const {
  getReviewRubric,
  isReviewKind,
  resolveReviewStep,
} = require('../utils/node-ai-review-rubric')
const { buildRuleSuggestions, parseModelSuggestions } = require('../utils/node-ai-review-rules')
const { FLOW_VERSION } = require('../../vendor/shared/constants/service-flow-nodes')

const jobsInFlight = new Set()

function text(value) {
  return String(value || '').trim()
}

function sortFlowNodes(nodes) {
  return (Array.isArray(nodes) ? nodes : [])
    .slice()
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
}

function readFlowNodes(album) {
  const pkg = (album && album.contentPackageJson) || {}
  return sortFlowNodes(pkg.flowNodes)
}

function sanitizeAiReviewForView(aiReview) {
  if (!aiReview || typeof aiReview !== 'object') return null
  const status = text(aiReview.status)
  if (!status) return null
  return {
    status,
    source: text(aiReview.source),
    suggestions: Array.isArray(aiReview.suggestions) ? aiReview.suggestions : [],
    acknowledged: Boolean(aiReview.acknowledged),
    fingerprint: text(aiReview.fingerprint),
    updatedAt: text(aiReview.updatedAt),
    waitHint: '正在检查',
    emptyHint: '未发现可改之处',
    errorMessage:
      status === 'failed' ? text(aiReview.errorMessage) || '检查未完成' : '',
  }
}

function collectNodeImageUrls(node = {}) {
  const urls = []
  const push = (value) => {
    const url = typeof value === 'string' ? value : value && value.url
    const trimmed = text(url)
    if (trimmed) urls.push(trimmed)
  }
  const draft = node.photoDraft || {}
  push(draft.deliveryExteriorUrl)
  ;(Array.isArray(draft.selectedDeliveryUrls) ? draft.selectedDeliveryUrls : []).forEach(push)
  ;(Array.isArray(draft.findings) ? draft.findings : []).forEach((row) => {
    push(row && row.url)
    ;(Array.isArray(row && row.images) ? row.images : []).forEach(push)
  })
  const payload = (node.document && node.document.payload) || {}
  ;(Array.isArray(payload.findings) ? payload.findings : []).forEach((row) => {
    push(row && row.url)
    ;(Array.isArray(row && row.images) ? row.images : []).forEach(push)
  })
  const seen = new Set()
  return urls.filter((url) => {
    const key = stripUrlQuery(url)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildReviewFingerprint(node, extra = {}) {
  const payload = {
    urls: collectNodeImageUrls(node).map((url) => stripUrlQuery(url)).sort(),
    complaint: text((node.photoDraft && node.photoDraft.chiefComplaint) || extra.chiefComplaint),
    mileage: text((node.photoDraft && node.photoDraft.mileageKm) || extra.mileageKm),
    findings: ((node.photoDraft && node.photoDraft.findings) || extra.findings || []).map((row) => ({
      p: text(row && row.partName),
      c: text(row && row.caption),
      a: text(row && row.advice),
      r: text(row && row.result),
    })),
    warranty: text((node.photoDraft && node.photoDraft.warrantyPeriod) || extra.warrantyPeriod),
    lines: (extra.quoteLines || []).map((line) => ({ n: text(line && line.name) })),
  }
  return crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex')
}

async function resolveCapabilityForMerchant(merchantId) {
  const { getOrCreateSubscription } = require('./merchant-subscription.service')
  let sub = null
  if (merchantId) {
    try {
      sub = await getOrCreateSubscription(merchantId)
    } catch (_) {
      sub = null
    }
  }
  return resolveNodeAiReviewCapability(sub, config.nodeAiReview)
}

function wantsSkip(payload = {}) {
  return Boolean(payload.aiReviewAck || payload.skipAiReview)
}

async function patchFlowNode(albumId, nodeId, mutator) {
  const album = await prisma.album.findUnique({ where: { id: albumId } })
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  const pkg = album.contentPackageJson && typeof album.contentPackageJson === 'object'
    ? album.contentPackageJson
    : {}
  const nodes = sortFlowNodes(pkg.flowNodes)
  const index = nodes.findIndex((item) => item && item.id === nodeId)
  if (index < 0) {
    const err = new Error('节点不存在')
    err.status = 404
    throw err
  }
  nodes[index] = mutator(nodes[index], nodes) || nodes[index]
  const next = { ...pkg, flowVersion: FLOW_VERSION, flowNodes: nodes }
  await prisma.album.update({
    where: { id: albumId },
    data: { contentPackageJson: next },
  })
  return nodes[index]
}

function buildReviewContext(album, node, extra = {}) {
  const draft = node.photoDraft || {}
  const doc = (node.document && node.document.payload) || {}
  const quoteNode = extra.quoteNode || readFlowNodes(album).find(
    (item) => item && item.kind === 'quote_confirm' && !item.insertedReason,
  )
  const quotePayload = (quoteNode && quoteNode.document && quoteNode.document.payload) || {}
  const findings = draft.findings || doc.findings || []
  return {
    rubric: getReviewRubric(album.templateId, node.kind, album.serviceName),
    chiefComplaint: text(draft.chiefComplaint || doc.chiefComplaint || extra.chiefComplaint),
    mileageKm: draft.mileageKm || extra.mileageKm,
    findings,
    warrantyPeriod: draft.warrantyPeriod || extra.warrantyPeriod,
    warrantyNotes: draft.warrantyNotes,
    conclusion: draft.conclusion || doc.conclusion,
    quoteLines: extra.quoteLines || quotePayload.lines || [],
  }
}

function lookupMaskedUrl(byRawUrl, rawUrl) {
  if (!byRawUrl || !rawUrl) return ''
  const raw = text(rawUrl)
  return (
    byRawUrl.get(raw) ||
    byRawUrl.get(stripUrlQuery(raw)) ||
    ''
  )
}

async function collectMaskedUrlsForNode(albumId, node) {
  const { buildPreMaskUrlLookup } = require('./desensitize.service')
  const lookup = await buildPreMaskUrlLookup(albumId)
  if (!lookup.ready) return { ready: false, urls: [] }
  const urls = []
  collectNodeImageUrls(node).forEach((raw) => {
    const masked = lookupMaskedUrl(lookup.byRawUrl, raw)
    if (masked) urls.push(masked)
  })
  return { ready: true, urls }
}

async function runLlmSuggestions(ctx, maskedUrls, capability) {
  if (!capability.llmEnabled) return null
  const llm = config.geoLlm || {}
  const vision = config.geoVision || {}
  if (!llm.apiKey && !vision.apiKey) return null
  const useVision = Boolean(vision.enabled && maskedUrls.length && (vision.apiKey || llm.apiKey))
  const { chatCompletion } = require('../lib/dashscope-chat')
  const rubricBrief = {
    category: ctx.rubric.category,
    step: ctx.rubric.step,
    photos: (ctx.rubric.photos || []).map((row) => ({
      itemKey: row.itemKey,
      part: row.part,
      how: row.how,
    })),
    texts: ctx.rubric.texts || [],
  }
  const facts = {
    chiefComplaint: ctx.chiefComplaint,
    mileageKm: ctx.mileageKm || '',
    findings: (ctx.findings || []).map((row) => ({
      partName: row.partName || '',
      result: row.result || '',
      advice: row.advice || '',
      caption: row.caption || '',
    })),
    warrantyPeriod: ctx.warrantyPeriod || '',
    quoteLines: (ctx.quoteLines || []).map((line) => ({ name: line && line.name })),
  }
  const instruction = [
    '你是汽修店员的核对助手。只根据本单已有事实给优化方向，不要百科，不要编造没拍到的读数。',
    '输出 JSON：{"suggestions":[{"id","type":"photo|text","itemKey","title","how","field","suggestedText","findingIndex","lineIndex"}]}',
    '每条只改一件事。title 只写部位或字段名，如「右前门近景」「主诉」，不要写优化/规范/标准话术。',
    'photo：how 写拍哪、怎么拍（距离、要入镜的读数、避码）；不要 suggestedText。',
    'text：field 必须是 chiefComplaint / findingAdvice / findingCaption / warrantyPeriod / quoteLineName 之一；suggestedText 必须是可直接填进该字段的整句。',
    '禁止改金额、禁止建议合并增项、禁止保证修好/无色差。只用打码图。',
    `提纲：${JSON.stringify(rubricBrief)}`,
    `本步草稿：${JSON.stringify(facts)}`,
  ].join('\n')

  const userContent = useVision
    ? [{ type: 'text', text: instruction }].concat(
        maskedUrls.slice(0, 6).map((url) => ({ type: 'image_url', image_url: { url } })),
      )
    : instruction

  const result = await chatCompletion({
    apiUrl: useVision ? vision.apiUrl : llm.apiUrl,
    apiKey: useVision ? vision.apiKey || llm.apiKey : llm.apiKey,
    model: useVision ? vision.model : llm.model,
    messages: [
      { role: 'system', content: '只输出 JSON。建议必须可执行，不要空话。' },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
    responseFormat: { type: 'json_object' },
    enableThinking: false,
    timeoutMs: Math.min(Number(llm.timeoutMs || 60000), 60000),
  })
  return parseModelSuggestions(result && result.text, [])
}

async function analyzeNode(album, node, capability) {
  const ctx = buildReviewContext(album, node)
  const fallback = buildRuleSuggestions(ctx)
  const step = resolveReviewStep(node.kind)
  let masked = { ready: true, urls: [] }
  if (step !== 'quote_check' && collectNodeImageUrls(node).length) {
    masked = await collectMaskedUrlsForNode(album.id, node)
  }
  let suggestions = fallback
  let source = 'rule'
  if (capability.llmEnabled) {
    try {
      const fromModel = await runLlmSuggestions(ctx, masked.urls, capability)
      if (fromModel && fromModel.length) {
        suggestions = fromModel
        source = 'llm'
      }
    } catch (error) {
      source = 'rule'
      return {
        suggestions: fallback,
        source,
        errorMessage: text(error && error.message).slice(0, 120),
      }
    }
  }
  return { suggestions, source, errorMessage: '' }
}

async function runNodeAiReviewJob(albumId, nodeId, merchantId) {
  const key = `${albumId}:${nodeId}`
  if (jobsInFlight.has(key)) return
  jobsInFlight.add(key)
  try {
    const { loadAlbum } = require('./service-album.service')
    const album = await loadAlbum(albumId)
    if (!album) return
    const node = readFlowNodes(album).find((item) => item && item.id === nodeId)
    if (!node || !isReviewKind(node.kind)) return
    const current = node.aiReview || {}
    if (current.status === 'ready' && current.acknowledged) return
    await patchFlowNode(albumId, nodeId, (item) => ({
      ...item,
      aiReview: {
        ...(item.aiReview || {}),
        status: 'running',
        updatedAt: new Date().toISOString(),
      },
    }))

    const step = resolveReviewStep(node.kind)
    if (step !== 'quote_check' && collectNodeImageUrls(node).length) {
      const { scheduleAlbumPreMask, getAlbumPreMaskReadiness } = require('./desensitize.service')
      scheduleAlbumPreMask(albumId, { trigger: 'node_ai_review' })
      const started = Date.now()
      let readiness = await getAlbumPreMaskReadiness(albumId)
      while (readiness.state === 'pending' && Date.now() - started < 90000) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        readiness = await getAlbumPreMaskReadiness(albumId)
      }
    }

    const fresh = await loadAlbum(albumId)
    const freshNode = readFlowNodes(fresh).find((item) => item && item.id === nodeId) || node
    const capability = await resolveCapabilityForMerchant(merchantId)
    const analyzed = await analyzeNode(fresh, freshNode, capability)
    await patchFlowNode(albumId, nodeId, (item) => ({
      ...item,
      aiReview: {
        ...(item.aiReview || {}),
        status: 'ready',
        source: analyzed.source,
        suggestions: analyzed.suggestions,
        errorMessage: analyzed.errorMessage || '',
        acknowledged: false,
        updatedAt: new Date().toISOString(),
      },
    }))
  } catch (error) {
    try {
      const { loadAlbum } = require('./service-album.service')
      const album = await loadAlbum(albumId)
      const node = album ? readFlowNodes(album).find((item) => item && item.id === nodeId) : null
      const fallback = node
        ? buildRuleSuggestions(buildReviewContext(album, node))
        : []
      await patchFlowNode(albumId, nodeId, (item) => ({
        ...item,
        aiReview: {
          ...(item.aiReview || {}),
          status: 'ready',
          source: 'rule',
          suggestions: fallback,
          errorMessage: text(error && error.message).slice(0, 120),
          acknowledged: false,
          updatedAt: new Date().toISOString(),
        },
      }))
    } catch (_) {
      /* ignore */
    }
  } finally {
    jobsInFlight.delete(key)
  }
}

function queueReviewJob(albumId, nodeId, merchantId) {
  setImmediate(() => {
    runNodeAiReviewJob(albumId, nodeId, merchantId).catch(() => {})
  })
}

async function flushQueuedNodeAiReviewsForAlbum(albumId) {
  const { loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) return
  const nodes = readFlowNodes(album).filter((node) => {
    const status = node && node.aiReview && node.aiReview.status
    return status === 'queued' || status === 'running'
  })
  await Promise.all(
    nodes.map((node) => runNodeAiReviewJob(albumId, node.id, album.merchantId || '')),
  )
}

async function startOrResumeReview({ album, node, merchantId, incomingDraft, extra = {} }) {
  const merged = {
    ...node,
    photoDraft: incomingDraft || node.photoDraft || {},
  }
  const fingerprint = buildReviewFingerprint(merged, extra)
  const existing = node.aiReview || {}
  if (
    existing.fingerprint === fingerprint &&
    (existing.status === 'queued' || existing.status === 'running' || existing.status === 'ready')
  ) {
    if (existing.status === 'queued' || existing.status === 'running') {
      queueReviewJob(album.id, node.id, merchantId)
    }
    return sanitizeAiReviewForView(existing)
  }

  await patchFlowNode(album.id, node.id, (item) => ({
    ...item,
    photoDraft: incomingDraft || item.photoDraft || {},
    aiReview: {
      status: 'queued',
      fingerprint,
      suggestions: [],
      source: '',
      acknowledged: false,
      errorMessage: '',
      updatedAt: new Date().toISOString(),
    },
  }))
  queueReviewJob(album.id, node.id, merchantId)
  return sanitizeAiReviewForView({
    status: 'queued',
    fingerprint,
    suggestions: [],
    acknowledged: false,
    updatedAt: new Date().toISOString(),
  })
}

async function maybeHoldCompleteForAiReview({
  album,
  node,
  merchantId,
  incomingDraft,
  payload = {},
}) {
  if (!isReviewKind(node.kind) || node.kind === 'inspection_report') return null
  const capability = await resolveCapabilityForMerchant(merchantId)
  if (!capability.entitled) return null
  if (wantsSkip(payload)) {
    await patchFlowNode(album.id, node.id, (item) => ({
      ...item,
      photoDraft: incomingDraft || item.photoDraft,
      aiReview: {
        ...(item.aiReview || {}),
        acknowledged: true,
        updatedAt: new Date().toISOString(),
      },
    }))
    return null
  }
  const review = await startOrResumeReview({
    album,
    node,
    merchantId,
    incomingDraft,
  })
  return {
    completed: false,
    nextAction: 'ai_review',
    review,
    message: '正在检查',
  }
}

async function maybeHoldDeliverForAiReview({ album, node, merchantId, payload = {} }) {
  if (node.kind !== 'inspection_report') return null
  const capability = await resolveCapabilityForMerchant(merchantId)
  if (!capability.entitled) return null
  if (wantsSkip(payload)) {
    await patchFlowNode(album.id, node.id, (item) => ({
      ...item,
      aiReview: {
        ...(item.aiReview || {}),
        acknowledged: true,
        updatedAt: new Date().toISOString(),
      },
    }))
    return null
  }
  const quoteLines =
    (payload.quote && payload.quote.payload && payload.quote.payload.lines) || []
  const review = await startOrResumeReview({
    album,
    node: {
      ...node,
      document: {
        ...(node.document || {}),
        payload: {
          ...((node.document && node.document.payload) || {}),
          ...((payload.document && payload.document.payload) || {}),
        },
      },
    },
    merchantId,
    extra: { quoteLines },
  })
  return {
    delivered: false,
    nextAction: 'ai_review',
    review,
    message: '正在检查',
  }
}

async function getNodeAiReview(albumId, storeId, nodeId, merchantId) {
  const { loadAlbum, assertMerchantAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  assertMerchantAlbum(album, storeId, merchantId)
  const node = readFlowNodes(album).find((item) => item && item.id === nodeId)
  if (!node) {
    const err = new Error('节点不存在')
    err.status = 404
    throw err
  }
  const capability = await resolveCapabilityForMerchant(merchantId)
  const review = sanitizeAiReviewForView(node.aiReview)
  if (
    capability.entitled &&
    review &&
    (review.status === 'queued' || review.status === 'running')
  ) {
    queueReviewJob(albumId, nodeId, merchantId)
  }
  return {
    capability: publicNodeAiReviewCapability(capability),
    review,
  }
}

module.exports = {
  sanitizeAiReviewForView,
  resolveCapabilityForMerchant,
  publicNodeAiReviewCapability,
  maybeHoldCompleteForAiReview,
  maybeHoldDeliverForAiReview,
  getNodeAiReview,
  flushQueuedNodeAiReviewsForAlbum,
  runNodeAiReviewJob,
}
