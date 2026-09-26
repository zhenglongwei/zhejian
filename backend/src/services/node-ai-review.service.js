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
    findings: (
      (node.photoDraft && node.photoDraft.findings) ||
      (node.document && node.document.payload && node.document.payload.findings) ||
      extra.findings ||
      []
    ).map((row) => ({
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

/** 「看过了，放行」只对同一份内容生效：
 *  没查过、或内容已经改过，都不能凭上一次的确认放行，必须重新查。 */
function isAckStale(node, extra = {}) {
  const current = (node && node.aiReview) || {}
  if (current.status !== 'ready' && current.status !== 'failed') return true
  const doc = (node && node.document && node.document.payload) || {}
  const quoteLines = Array.isArray(extra.quoteLines)
    ? extra.quoteLines
    : Array.isArray(doc.lines)
      ? doc.lines
      : []
  const fingerprint = buildReviewFingerprint(node, { ...extra, quoteLines })
  return !current.fingerprint || current.fingerprint !== fingerprint
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
  const reportNode = readFlowNodes(album).find((item) => item && item.kind === 'inspection_report')
  const reportPayload = (reportNode && reportNode.document && reportNode.document.payload) || {}
  /**
   * 只读参考：已确认（或已随通知送达）的检测报告与报价方案。
   * 只用来把本步描述写准；**不得**对它提修改意见，也**不写回**。
   * 与「本步检查对象」分开存放，避免模型把两者混为一谈
   * （docs/04_维修过程相册/26_ 确认前检查 · 哪些步）
   */
  const reference = {
    reportFindings: [],
    quoteLines: [],
  }
  const fillConfirmedReference = () => {
    reference.reportFindings = Array.isArray(reportPayload.findings) ? reportPayload.findings : []
    reference.quoteLines = Array.isArray(quotePayload.lines) ? quotePayload.lines : []
  }
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
  } else if (
    reviewStep === 'delivery' &&
    (node.kind === 'repair_report' || node.kind === 'delivery_photos')
  ) {
    // 完工通知前：施工项 + 交车照一起看（26_ 确认前检查 · 哪些步）。
    // 交车照步与完工报告单据是同一环节——交车照一完成，完工报告就发给车主确认、
    // 内容随即固定托管到网站，所以这一步查的就是车主看到的那一整份内容，
    // 不能只查交车照草稿。刚提交的草稿在排队时已写进节点，这里读得到。
    findings = []
    readFlowNodes(album).forEach((item) => {
      if (!item || item.kind !== 'work') return
      const rows = item.photoDraft && item.photoDraft.findings
      if (Array.isArray(rows)) findings = findings.concat(rows)
    })
    readFlowNodes(album).forEach((item) => {
      if (!item || item.kind !== 'delivery_photos') return
      const draftDelivery = item.photoDraft || {}
      const urls = []
      const exterior = text(draftDelivery.deliveryExteriorUrl)
      if (exterior) urls.push(exterior)
      ;(Array.isArray(draftDelivery.selectedDeliveryUrls)
        ? draftDelivery.selectedDeliveryUrls
        : []
      ).forEach((url) => {
        const trimmed = text(url)
        if (trimmed && urls.indexOf(trimmed) < 0) urls.push(trimmed)
      })
      if (!urls.length) return
      findings = findings.concat([
        {
          partName: '交车',
          advice: '',
          caption: text(draftDelivery.warrantyNotes),
          images: urls,
          url: urls[0] || '',
        },
      ])
    })
    quoteLines = []
    fillConfirmedReference()
  } else if (reviewStep === 'work' || reviewStep === 'delivery') {
    // 施工、交车：本步内容自评；带已确认的检测报告与报价作只读参考
    quoteLines = []
    fillConfirmedReference()
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
      : reviewStep === 'notify_check'
        ? {
            category: resolveReviewCategory(album.templateId, album.serviceName),
            step: 'notify_check',
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
    /** 只读参考，与上面的检查对象分离；模型不得对它提修改意见 */
    reference,
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
  const { resolveConfiguredNodeAiReviewEngines } = require('../lib/node-ai-review-llm-registry')
  const engines = resolveConfiguredNodeAiReviewEngines()
  if (!engines.length) return null
  const { chatCompletion } = require('../lib/dashscope-chat')
  const { responsesCompletion } = require('../lib/responses-chat')
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
    /** 已确认参考（只读）：不输出针对它的修改意见 */
    confirmedReference: {
      reportFindings: ((ctx.reference && ctx.reference.reportFindings) || []).map((row) => ({
        partName: (row && row.partName) || '',
        result: (row && row.result) || '',
        advice: (row && row.advice) || '',
      })),
      quoteLines: ((ctx.reference && ctx.reference.quoteLines) || []).map((line) => ({
        name: (line && line.name) || '',
        note: (line && line.note) || '',
      })),
    },
  }
  const stepNote =
    ctx.rubric.step === 'quote_check'
      ? '这是发给车主确认前的核对。同时看检测发现和报价。除了让两边对得上，还要把每条报价行的施工方案写清楚：做什么工序、用什么件与规格、依据哪条发现，车主和之后看公开案例的人要能一眼看懂这一条做了什么。只能用本单已有的检测发现与当前行内容来组织句子，不许编造没拍到、没提到的工序或读数。不要改金额。'
      : ctx.rubric.step === 'addon_check'
        ? '这是通知车主前的核对。同时看已经做过的施工、新发现和这次报价。可以建议改新发现的说明，或改报价的项目名和施工方案，使两边对得上。不要改金额。不要改已经确认过的首次检测和首次报价。'
        : ctx.rubric.step === 'delivery'
          ? '这是完工通知前的一次核对。看施工与交车照。confirmedReference 是已确认的检测结论与报价项目，只能用来把完工描述写准；不要对它提修改意见，也不要改金额。'
          : ctx.rubric.step === 'work'
            ? '只看本步施工。confirmedReference 是已确认的检测结论与报价项目，只能用来把本步施工的项目名和说明写准写具体；不要对它提修改意见，也不要改金额。'
              : ctx.rubric.step === 'notify_check'
                ? '这是发给车主查看前的一次核对。只能根据本单已有的检测发现与当前单据内容组织句子，不许编造没拍到、没提到的工序或读数。不要改金额。'
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
  const buildUserContent = () => {
    if (!labeled.length) return instruction
    return [{ type: 'text', text: instruction }].concat(
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
  }

  // 按序换模型：单个模型不可用就换下一个，全部不可用才回退规则建议
  const failures = []
  let called = false
  for (const engine of engines) {
    try {
      // 豆包走 Responses API（input/input_image），通义走 chat/completions（messages/image_url）
      const callModel = engine.protocol === 'responses' ? responsesCompletion : chatCompletion
      const result = await callModel({
        apiUrl: engine.apiUrl,
        apiKey: engine.apiKey,
        model: engine.model,
        messages: [
          { role: 'system', content: '只输出 JSON。建议必须可执行，不要空话。' },
          { role: 'user', content: buildUserContent() },
        ],
        temperature: 0.2,
        // response_format / enable_thinking 是通义专有参数，其它厂商不认，别乱传
        responseFormat: engine.vendor === 'dashscope' ? { type: 'json_object' } : undefined,
        enableThinking: engine.vendor === 'dashscope' ? false : undefined,
        timeoutMs: Math.min(Number(engine.timeoutMs || 60000), 60000),
      })
      called = true
      const suggestions = parseModelSuggestions(result && result.text, [])
      if (suggestions.length) return { suggestions, source: 'llm', engine: engine.id }
    } catch (error) {
      failures.push(`${engine.id}：${text(error && error.message).slice(0, 80)}`)
    }
  }
  if (!called && failures.length) {
    throw new Error(`模型不可用：${failures.join('；')}`)
  }
  return null
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
      if (fromModel && fromModel.suggestions && fromModel.suggestions.length) {
        suggestions = fromModel.suggestions
        source = fromModel.source || 'llm'
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
    // 已经排进检查队列就执行：该不该检查由「是否发给车主」这些动作在排队时定好，
    // 这里不再按单据类型放行，免得新单据类型排了队却没人执行、一直卡在「正在检查」
    const runnable = Boolean(node && reviewStep)
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
  const kind = String(node.kind || '')
  // 接车与检测不在这里查：其内容随检测报告在「通知车主前」一起核对。
  // 施工、完工照完成时查本步（docs/04_维修过程相册/26_ · 28_ 确认前检查）
  // quote_confirm 不在这里查：它的核对发生在发给车主确认前，不在「完成」这一刻
  if (
    !isReviewKind(kind) ||
    kind === 'intake_inspection' ||
    kind === 'inspection_report' ||
    kind === 'quote_confirm'
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
    extra: { step: resolveReviewStep(kind) },
  })
  return {
    completed: false,
    nextAction: 'ai_review',
    review,
    message: '正在检查',
  }
}

async function maybeHoldDeliverForAiReview({ album, node, merchantId, payload = {} }) {
  // 送达即车主可见：查不查由这个动作决定，不再按单据类型挑
  const capability = await resolveCapabilityForMerchant(merchantId)
  if (!capability.entitled) return null
  const quoteLines =
    (payload.quote && payload.quote.payload && payload.quote.payload.lines) || []
  const mergedNode = {
    ...node,
    document: {
      ...(node.document || {}),
      payload: {
        ...((node.document && node.document.payload) || {}),
        ...((payload.document && payload.document.payload) || {}),
      },
    },
  }
  if (wantsSkip(payload) && !isAckStale(mergedNode, { quoteLines })) {
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
  const review = await startOrResumeReview({
    album,
    node: mergedNode,
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

/** 发给车主时按内容决定检查口径——它只决定「查什么」，不决定「查不查」。
 *  查不查看这次是不是发给车主（由调用方判定），所以新增单据类型会自动纳入检查。 */
function resolveNotifyReviewStep(node = {}) {
  const kind = String(node.kind || '')
  // 增项有两种写法：独立类型 addon_quote_confirm，或 quote_confirm + insertedReason=addon
  const isAddon =
    kind === 'addon_quote_confirm' ||
    (kind === 'quote_confirm' && String(node.insertedReason || '') === 'addon')
  if (isAddon) return 'addon_check'
  if (kind === 'quote_confirm') return 'quote_check'
  if (kind === 'inspection_report') return 'quote_check'
  if (kind === 'repair_report') return 'delivery'
  if (kind === 'work_order') return 'work'
  return 'notify_check'
}

/** 发给车主前查一次 */
async function maybeHoldNotifyForAiReview({ album, node, merchantId, payload = {} }) {
  const kind = String((node && node.kind) || '')
  const reviewStep = resolveNotifyReviewStep(node)
  const capability = await resolveCapabilityForMerchant(merchantId)
  if (!capability.entitled) return null
  const doc = (node.document && node.document.payload) || {}
  const quoteLines = kind === 'quote_confirm' && Array.isArray(doc.lines) ? doc.lines : []
  if (wantsSkip(payload) && !isAckStale(node, { quoteLines })) {
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
