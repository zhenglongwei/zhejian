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
  resolveReviewCategory,
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

function collectNodeImageEntries(node = {}) {
  const entries = []
  const push = (value, label) => {
    const url = typeof value === 'string' ? value : value && value.url
    const trimmed = text(url)
    if (trimmed) entries.push({ url: trimmed, label: text(label) })
  }
  const draft = node.photoDraft || {}
  push(draft.deliveryExteriorUrl, '全车外观')
  push(draft.odometerUrl, '仪表里程')
  ;(Array.isArray(draft.selectedDeliveryUrls) ? draft.selectedDeliveryUrls : []).forEach((url) => {
    push(url, '交车图')
  })
  const pushFindings = (list) => {
    ;(Array.isArray(list) ? list : []).forEach((row, index) => {
      const label = `发现项${index} ${text(row && row.partName)}`.trim()
      push(row && row.url, label)
      ;(Array.isArray(row && row.images) ? row.images : []).forEach((img) => push(img, label))
    })
  }
  pushFindings(draft.findings)
  const payload = (node.document && node.document.payload) || {}
  pushFindings(payload.findings)
  const discovery = payload.discovery && typeof payload.discovery === 'object' ? payload.discovery : {}
  ;(Array.isArray(discovery.images) ? discovery.images : []).forEach((url) => push(url, '新发现'))
  ;(Array.isArray(payload.deliveryPhotos) ? payload.deliveryPhotos : []).forEach((row) => {
    push(row, '交车图')
  })
  const seen = new Set()
  return entries.filter((row) => {
    const key = stripUrlQuery(row.url)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function collectNodeImageUrls(node = {}) {
  return collectNodeImageEntries(node).map((row) => row.url)
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
    lines: (extra.quoteLines || []).map((line) => ({
      n: text(line && line.name),
      t: text(line && line.note),
    })),
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
  const reviewStep =
    extra.step || (node.aiReview && node.aiReview.reviewStep) || resolveReviewStep(node.kind)
  const quoteNode = extra.quoteNode || readFlowNodes(album).find(
    (item) => item && item.kind === 'quote_confirm' && !item.insertedReason,
  )
  const quotePayload = (quoteNode && quoteNode.document && quoteNode.document.payload) || {}
  let findings = draft.findings || doc.findings || []
  let quoteLines = extra.quoteLines || quotePayload.lines || []
  if (reviewStep === 'addon_check') {
    const parent = readFlowNodes(album).find((item) => item && item.id === node.parentNodeId)
    const workFindings =
      (parent && parent.photoDraft && parent.photoDraft.findings) || []
    const discovery = doc.discovery && typeof doc.discovery === 'object' ? doc.discovery : {}
    const images = Array.isArray(discovery.images) ? discovery.images.filter(Boolean) : []
    findings = workFindings.concat([
      {
        partName: '新发现',
        advice: text(discovery.note),
        caption: text(discovery.note),
        images,
        url: images[0] || '',
      },
    ])
    quoteLines = Array.isArray(doc.lines) ? doc.lines : []
  } else if (reviewStep === 'delivery' && node.kind === 'repair_report') {
    findings = []
    readFlowNodes(album).forEach((item) => {
      if (!item || item.kind !== 'work') return
      const rows = item.photoDraft && item.photoDraft.findings
      if (Array.isArray(rows)) findings = findings.concat(rows)
    })
    quoteLines = []
  } else if (reviewStep === 'work' || reviewStep === 'delivery') {
    quoteLines = []
  }
  const rubricKind = reviewStep === 'delivery' ? 'delivery_photos' : node.kind
  const rubric =
    reviewStep === 'addon_check'
      ? {
          category: resolveReviewCategory(album.templateId, album.serviceName),
          step: 'addon_check',
          photos: [],
          texts: [],
        }
      : getReviewRubric(album.templateId, rubricKind, album.serviceName)
  return {
    rubric,
    chiefComplaint: text(draft.chiefComplaint || doc.chiefComplaint || extra.chiefComplaint),
    mileageKm: draft.mileageKm || extra.mileageKm,
    odometerUrl: draft.odometerUrl || extra.odometerUrl || '',
    findings,
    warrantyPeriod: draft.warrantyPeriod || doc.warrantyPeriod || extra.warrantyPeriod,
    warrantyNotes: draft.warrantyNotes || doc.warrantyNotes,
    conclusion: draft.conclusion || doc.conclusion,
    quoteLines,
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
  collectNodeImageEntries(node).forEach((row) => {
    const masked = lookupMaskedUrl(lookup.byRawUrl, row.url)
    if (masked) urls.push({ url: masked, label: row.label })
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
    findings: (ctx.findings || []).map((row, index) => ({
      index,
      partName: row.partName || '',
      result: row.result || '',
      advice: row.advice || '',
      caption: row.caption || '',
    })),
    warrantyPeriod: ctx.warrantyPeriod || '',
    quoteLines: (ctx.quoteLines || []).map((line, index) => ({
      index,
      name: (line && line.name) || '',
      note: (line && line.note) || '',
      brand: (line && line.brand) || '',
    })),
  }
  const stepNote =
    ctx.rubric.step === 'quote_check'
      ? '这是通知车主前的核对。同时看检测发现和报价。可以建议改某一项的检查发现，也可以建议改报价的项目名或施工方案，使两边对得上。报价里要做的事应能在检测里找到依据。不要改金额。'
      : ctx.rubric.step === 'addon_check'
        ? '这是通知车主前的核对。同时看已经做过的施工、新发现和这次报价。可以建议改新发现的说明，或改报价的项目名和施工方案，使两边对得上。不要改金额。不要改已经确认过的首次检测和首次报价。'
        : ctx.rubric.step === 'delivery'
          ? '这是完工通知前的一次核对。只看施工和交车。不要改已经确认过的检测和报价，也不要改金额。'
          : ctx.rubric.step === 'work'
            ? '检测报告和报价已经固定，不要对主诉、检查发现、报价项目或施工方案提修改意见。只看本步。'
            : ''
  const instruction = [
    '你是汽修店员的核对助手。只根据本单已有事实给优化方向，不要百科，不要编造没拍到的读数。',
    stepNote,
    '输出 JSON：{"suggestions":[{"id","type":"photo|text","itemKey","title","how","field","suggestedText","findingIndex","lineIndex","part"}]}',
    '每条只改一件事。title 只写部位或字段名，如「右前门近景」「主诉」，不要写优化/规范/标准话术。',
    '每条都带 part：发现项的 part 必须与草稿 findings 里该条 partName 完全一致。',
    'findingIndex 必须等于该条 findings 的 index。how 和 suggestedText 只描述这一个部位，不要把别的部位写进同一条。',
    '改报价时 lineIndex 必须等于 quoteLines 的 index。项目名用 field=quoteLineName，施工方案用 field=quoteLineNote。',
    '仪表、里程不是发现项：补拍仪表时 part 写「仪表」，不要填 findingIndex。',
    'photo：how 写拍哪、怎么拍（距离、要入镜的读数、避码）；不要 suggestedText。',
    'text：field 必须是 chiefComplaint / findingAdvice / findingCaption / warrantyPeriod / quoteLineName / quoteLineNote 之一；suggestedText 必须是可直接填进该字段的整句。',
    '禁止改金额、禁止建议合并增项、禁止保证修好/无色差。只用打码图。',
    `提纲：${JSON.stringify(rubricBrief)}`,
    `本步草稿：${JSON.stringify(facts)}`,
  ].join('\n')

  const labeled = Array.isArray(maskedUrls) ? maskedUrls.slice(0, 6) : []
  const userContent = useVision
    ? [{ type: 'text', text: instruction }].concat(
        labeled.flatMap((row) => {
          const url = typeof row === 'string' ? row : row && row.url
          if (!url) return []
          const label = typeof row === 'string' ? '' : String((row && row.label) || '').trim()
          const blocks = []
          if (label) blocks.push({ type: 'text', text: `下一张图：${label}` })
          blocks.push({ type: 'image_url', image_url: { url } })
          return blocks
        }),
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
  const imageNode = {
    ...node,
    photoDraft: {
      ...(node.photoDraft || {}),
      findings: ctx.findings || [],
    },
  }
  const fallback = buildRuleSuggestions(ctx)
  let masked = { ready: true, urls: [] }
  if (collectNodeImageUrls(imageNode).length) {
    masked = await collectMaskedUrlsForNode(album.id, imageNode)
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
    const reviewStep = String((node && node.aiReview && node.aiReview.reviewStep) || '')
    const runnable =
      node &&
      (isReviewKind(node.kind) ||
        reviewStep === 'addon_check' ||
        (reviewStep === 'delivery' && node.kind === 'repair_report'))
    if (!runnable) return
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

    const step = reviewStep || resolveReviewStep(node.kind)
    if (step && collectNodeImageUrls(node).length) {
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
  const reviewStep = text(extra.step || (node.aiReview && node.aiReview.reviewStep))
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
      reviewStep,
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
  if (
    !isReviewKind(node.kind) ||
    node.kind === 'inspection_report' ||
    node.kind === 'intake_inspection' ||
    node.kind === 'work' ||
    node.kind === 'delivery_photos'
  ) {
    return null
  }
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

/** 施工中新发现、完工确认：通知车主前查一次 */
async function maybeHoldNotifyForAiReview({ album, node, merchantId, payload = {} }) {
  const isAddon =
    node &&
    node.kind === 'quote_confirm' &&
    String(node.insertedReason || '') === 'addon'
  const isRepair = node && node.kind === 'repair_report'
  if (!isAddon && !isRepair) return null
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
  const doc = (node.document && node.document.payload) || {}
  const reviewStep = isAddon ? 'addon_check' : 'delivery'
  const quoteLines = isAddon && Array.isArray(doc.lines) ? doc.lines : []
  const review = await startOrResumeReview({
    album,
    node,
    merchantId,
    extra: {
      step: reviewStep,
      quoteLines,
    },
  })
  return {
    delivered: false,
    nextAction: 'ai_review',
    review,
    message: '正在检查',
  }
}

module.exports = {
  sanitizeAiReviewForView,
  resolveCapabilityForMerchant,
  publicNodeAiReviewCapability,
  maybeHoldCompleteForAiReview,
  maybeHoldDeliverForAiReview,
  maybeHoldNotifyForAiReview,
  getNodeAiReview,
  flushQueuedNodeAiReviewsForAlbum,
  runNodeAiReviewJob,
}
