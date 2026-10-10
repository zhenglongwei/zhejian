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
  resolveReviewCategory,
  resolveReviewStep,
  resolveRunReviewStep,
  planNodeReview,
} = require('../utils/node-ai-review-rubric')
const {
  buildRuleSuggestions,
  parseReviewModelJson,
  parseModelSuggestions,
  parseMerchantBrief,
  keepCompletenessSuggestions,
} = require('../utils/node-ai-review-rules')
const { isAckStale, canReuseReviewThisRound } = require('../utils/node-ai-review-ack')
const { FLOW_VERSION } = require('../../vendor/shared/constants/service-flow-nodes')
const { MECHANIC_VOICE_RULES } = require('../utils/mechanic-copy-voice')

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
  const merchantBrief = parseMerchantBrief(
    { merchantBrief: aiReview.merchantBrief || {} },
    {},
  )
  return {
    status,
    source: text(aiReview.source),
    suggestions: Array.isArray(aiReview.suggestions) ? aiReview.suggestions : [],
    merchantBrief,
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
      a: text(line && line.amount),
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
  if (reviewStep === 'quote_check' || reviewStep === 'addon_check') {
    if ((!Array.isArray(findings) || !findings.length) && Array.isArray(reportPayload.findings)) {
      findings = reportPayload.findings
    }
    if (node.kind === 'quote_confirm' && Array.isArray(doc.lines)) {
      quoteLines = extra.quoteLines && extra.quoteLines.length ? extra.quoteLines : doc.lines
    }
  }
  /** 工单项目（含增项工单）与完工报告施工项：完工验收时车主一并看到 */
  let orderItems = []
  let workItems = []
  if (reviewStep === 'work_sheet') {
    // 工单定稿：这份单据如实记录了施工过程，要拿它核对检测报告与报价方案。
    // 检测/报价都是定好的、不可改；工单完成不再排队，对账改在交车
    findings = Array.isArray(draft.findings) ? draft.findings : []
    quoteLines = Array.isArray(quotePayload.lines) ? quotePayload.lines : []
    orderItems = findings.map((row) => ({
      name: text(row.partName),
      brand: text(row.brand),
      material: text(row.material),
      qty: text(row.qty),
      note: text(row.caption),
      amount: row.amount,
    }))
    fillConfirmedReference()
  } else if (reviewStep === 'addon_check') {
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
    // 工单＝如实记录的施工单据：完工时要拿它跟检测、报价核对
    readFlowNodes(album).forEach((item) => {
      if (!item || item.kind !== 'work') return
      const rows = item.photoDraft && item.photoDraft.findings
      if (!Array.isArray(rows)) return
      orderItems = orderItems.concat(
        rows.map((row) => ({
          name: text(row.partName),
          brand: text(row.brand),
          material: text(row.material),
          qty: text(row.qty),
          note: text(row.caption),
          amount: row.amount,
        })),
      )
    })
    // 完工报告正文的施工项：车主这次看到的就是它
    workItems = Array.isArray(doc.workItems)
      ? doc.workItems
      : Array.isArray(doc.items)
        ? doc.items
        : []
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
        : reviewStep === 'work_sheet'
        ? getReviewRubric(album.templateId, node.kind, album.serviceName, 'work_sheet')
        : getReviewRubric(album.templateId, rubricKind, album.serviceName)
  return {
    skipEngineId: text(extra.skipEngineId),
    rubric,
    chiefComplaint: text(
      draft.chiefComplaint ||
        doc.chiefComplaint ||
        extra.chiefComplaint ||
        reportPayload.chiefComplaint ||
        (() => {
          const intake = readFlowNodes(album).find(
            (item) => item && (item.kind === 'intake' || item.kind === 'intake_inspection'),
          )
          return intake && intake.photoDraft && intake.photoDraft.chiefComplaint
        })(),
    ),
    mileageKm: draft.mileageKm || extra.mileageKm,
    odometerUrl: draft.odometerUrl || extra.odometerUrl || '',
    findings,
    orderItems,
    workItems,
    warrantyPeriod: draft.warrantyPeriod || doc.warrantyPeriod || extra.warrantyPeriod,
    warrantyNotes: draft.warrantyNotes || doc.warrantyNotes,
    conclusion: draft.conclusion || doc.conclusion,
    quoteLines,
    /** 只读参考，与上面的检查对象分离；模型不得对它提修改意见 */
    reference,
    priorFacts: (() => {
      try {
        const { resolveShared } = require('../utils/resolve-shared')
        const { buildPriorOrganizeFacts } = resolveShared('utils/service-flow-docs.js')
        const kind =
          reviewStep === 'delivery'
            ? 'delivery_photos'
            : reviewStep === 'work_sheet' || reviewStep === 'work'
              ? 'work'
              : reviewStep === 'quote_check'
                ? 'quote_confirm'
                : node.kind
        return buildPriorOrganizeFacts(readFlowNodes(album), kind)
      } catch (_) {
        return null
      }
    })(),
  }
}

async function collectMaskedUrlsForNode(albumId, node) {
  const { collectMaskedUrlsForRawList } = require('./desensitize.service')
  const entries = collectNodeImageEntries(node).map((row) => ({
    url: row.url,
    label: row.label,
  }))
  return collectMaskedUrlsForRawList(albumId, entries, { requireAll: false })
}

async function runLlmSuggestions(ctx, maskedUrls, capability, options = {}) {
  if (!capability.llmEnabled) return null
  const { resolveConfiguredNodeAiReviewEngines } = require('../lib/node-ai-review-llm-registry')
  const skipEngineId = text(options.skipEngineId)
  const engines = resolveConfiguredNodeAiReviewEngines().filter(
    (engine) => !skipEngineId || engine.id !== skipEngineId,
  )
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
      amount:
        ctx.rubric.step === 'quote_check' || ctx.rubric.step === 'addon_check'
          ? text(line && line.amount)
          : '',
    })),
    photoObservations: Array.isArray(ctx.photoObservations) ? ctx.photoObservations : [],
    /** 工单项目：车主验收时与施工过程一并看到，须对得上 */
    orderItems: (ctx.orderItems || []).map((line) => ({
      name: (line && line.name) || '',
      note: (line && line.note) || '',
      brand: (line && line.brand) || '',
    })),
    /** 完工报告正文的施工项：车主这次看到的就是它 */
    workItems: (ctx.workItems || []).map((line) => ({
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
  const accident = ctx.rubric.category === 'accident'
  const stepNote =
    ctx.rubric.step === 'quote_check'
      ? '这是发给车主确认前的核对。材料包括接车主诉、检测发现、本单报价。suggestions 只补空栏和缺图：栏里已经有字不要给 suggestedText，不要改句式。空栏才给一句可直接填的。merchantBrief 是给店员看的检查结果，不写进车主字段。issues/omissions/objections 每条必须是 {"title","body"}：title 4到12个字写部位或问题名，body 一两句人话。不要写发现项序号、字段名、规范、违反规定。omissions 只提醒可能漏查/漏报，不要编成收费行，不要放进 suggestions。objections 的 title 写成车主会问的原话，body 可空。priceBands 只针对已有报价行给原厂/品牌/经济件宽区间，不是实时行情。不要改金额，不要自动加报价行。'
      : ctx.rubric.step === 'addon_check'
        ? '这是通知车主前的核对。suggestions 只查新发现说明和这次报价有没有空项、该有的故障图有没有。已经写了的字不要改。merchantBrief 同样要核已写内容和可能漏了什么，漏项只提醒不自动加行。不要改金额。不要改已经确认过的首次检测和首次报价。'
        : ctx.rubric.step === 'delivery'
          ? '这是完工通知车主验收前的整单对账。接车、检测、已确认报价只作背景，不要建议改那些确认件。只指出工单、交车照、质保的错项或漏项。已经写了的字不要润色、不要给 suggestedText。不要把意见留到公开案例。不要改金额。'
          : ctx.rubric.step === 'work'
            ? '只看本步是否缺说明、缺图。已经写了的字不要改。有新旧配件或关键工序就按项归；缺哪一类都不要当成必须补拍。不要对已确认检测和报价提修改意见，也不要改金额。'
              : ctx.rubric.step === 'notify_check'
                ? '这是发给车主查看前的一次核对。只查空缺，不要改已经写了的句子。不要改金额。'
                : ''
  const instruction = [
    '你是汽修店员的核对助手。只根据本单已有事实查缺项，不要百科，不要编造没拍到的读数。',
    ctx.rubric.step === 'delivery'
      ? '不要润色已经写了的字。空栏才给一句可直接填的。'
      : MECHANIC_VOICE_RULES,
    stepNote,
    accident && (ctx.rubric.step === 'quote_check' || ctx.rubric.step === 'addon_check')
      ? '事故车不要给金额档，priceBands 必须空数组。'
      : '',
    '输出 JSON：{"suggestions":[{"id","type":"photo|text","itemKey","title","how","field","suggestedText","findingIndex","lineIndex","part"}],"merchantBrief":{"issues":[{"title","body"}],"omissions":[{"title","body"}],"objections":[{"title","body"}],"priceBands":[{"lineIndex","name","oem","brand","economy","note"}]}}',
    'text 只在对应字段为空时才给 suggestedText。栏里已经有字，一律不要出改句，保留店员原文。没有空缺就返回空 suggestions。quote_check / addon_check 即使 suggestions 为空，也要给 merchantBrief。',
    '每条只改一件事。title 只写部位或字段名，如「右前门近景」「主诉」，不要写优化/规范/标准话术。',
    '每条都带 part：发现项的 part 必须与草稿 findings 里该条 partName 完全一致。',
    'findingIndex 必须等于该条 findings 的 index。how 和 suggestedText 只描述这一个部位，不要把别的部位写进同一条。',
    '改报价时 lineIndex 必须等于 quoteLines 的 index。项目名用 field=quoteLineName，施工方案用 field=quoteLineNote。',
    '仪表、里程不是发现项：补拍仪表时 part 写「仪表」，不要填 findingIndex。',
    'photo：how 写拍哪、怎么拍（距离、要入镜的读数、避码）；不要 suggestedText。',
    'text：field 必须是 chiefComplaint / findingAdvice / findingCaption / warrantyPeriod / quoteLineName / quoteLineNote 之一；suggestedText 必须是可直接填进该字段的整句。',
    '禁止改金额、禁止建议合并增项、禁止保证修好/无色差。只用打码图。',
    'priorFacts 是前面各步已经识过或写过的文字，不要再看那些图，不要改已经确认的检测和报价。',
    `提纲：${JSON.stringify(rubricBrief)}`,
    `本步草稿：${JSON.stringify(facts)}`,
    ctx.priorFacts ? `前面各步结果：${JSON.stringify(ctx.priorFacts)}` : '',
  ].filter(Boolean).join('\n')

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
      const parsed = parseReviewModelJson(result && result.text)
      if (!parsed) continue
      const suggestions = keepCompletenessSuggestions(parseModelSuggestions(parsed, []), ctx)
      const merchantBrief = parseMerchantBrief(parsed, ctx)
      return { suggestions, merchantBrief, source: 'llm', engine: engine.id }
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
  const fallback = keepCompletenessSuggestions(buildRuleSuggestions(ctx), ctx)
  let masked = { ready: true, urls: [] }
  if (collectNodeImageUrls(imageNode).length) {
    masked = await collectMaskedUrlsForNode(album.id, imageNode)
  }
  let visionUrls = masked.urls || []
  let photoObservations = []
  if (visionUrls.length) {
    const { classifyReviewVisionRows, FLOW_ORGANIZE_PROMPT_VERSION } = require('./node-photo-organize.service')
    const { resolveShared } = require('../utils/resolve-shared')
    const { mediaKey } = resolveShared('utils/service-flow-docs.js')
    const images = Array.isArray(album.images) ? album.images : []
    const byMedia = {}
    const ids = []
    images.forEach((img) => {
      const key = mediaKey(img && img.rawUrl)
      if (key) byMedia[key] = img
      if (img && img.id) ids.push(img.id)
    })
    let byImageId = {}
    if (ids.length) {
      try {
        const rows = await prisma.albumImageVisionCache.findMany({
          where: {
            albumImageId: { in: ids },
            promptVersion: FLOW_ORGANIZE_PROMPT_VERSION,
          },
        })
        rows.forEach((row) => {
          if (row && row.albumImageId) byImageId[row.albumImageId] = row
        })
      } catch (_) {
        byImageId = {}
      }
    }
    const split = classifyReviewVisionRows(visionUrls, byMedia, byImageId)
    visionUrls = split.visionUrls
    photoObservations = split.cachedFacts
  }
  ctx.photoObservations = photoObservations
  let suggestions = fallback
  let source = 'rule'
  let merchantBrief = parseMerchantBrief({}, ctx)
  if (capability.llmEnabled) {
    try {
      const fromModel = await runLlmSuggestions(ctx, visionUrls, capability, {
        skipEngineId: ctx.skipEngineId,
      })
      if (fromModel) {
        if (fromModel.suggestions && fromModel.suggestions.length) {
          suggestions = fromModel.suggestions
        }
        if (fromModel.source) source = fromModel.source
        if (fromModel.merchantBrief) merchantBrief = fromModel.merchantBrief
      }
    } catch (error) {
      source = 'rule'
      return {
        suggestions: fallback,
        merchantBrief,
        source,
        errorMessage: text(error && error.message).slice(0, 120),
      }
    }
  }
  return { suggestions, merchantBrief, source, errorMessage: '' }
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
    if (!node) return
    // 已经排进检查队列就执行：该不该检查由「是否发给车主」这些动作在排队时定好，
    // 这里不再按单据类型放行，免得新单据类型排了队却没人执行、一直卡在「正在检查」。
    // 排队时没写口径的（如「报告送达」）按单据类型推，推不出就走通用口径：
    // 口径为空不能成为不执行的理由，否则状态永远停在「正在检查」
    const reviewStep = resolveRunReviewStep(node)
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
        merchantBrief: analyzed.merchantBrief || parseMerchantBrief({}, {}),
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
  if (canReuseReviewThisRound(merged, extra)) {
    console.info('[node-ai-review] 复用本轮结论', {
      nodeId: node.id,
      step: reviewStep,
      status: existing.status,
    })
    if (existing.status === 'queued' || existing.status === 'running') {
      queueReviewJob(album.id, node.id, merchantId)
    }
    return sanitizeAiReviewForView(existing)
  }
  console.info('[node-ai-review] 排队检查', {
    nodeId: node.id,
    step: reviewStep,
    fingerprint: String(fingerprint).slice(0, 8),
  })

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

/** 工单完成时核一次：工单是如实记录施工过程的单据，定稿前拿它跟检测报告、报价对一遍 */
async function maybeHoldWorkSheetForReview({
  album,
  node,
  merchantId,
  incomingDraft,
  payload = {},
}) {
  const plan = planNodeReview({ event: 'complete', node })
  if (!plan) return null
  const capability = await resolveCapabilityForMerchant(merchantId)
  if (!capability.entitled) return null
  const findings = Array.isArray(incomingDraft && incomingDraft.findings)
    ? incomingDraft.findings
    : []
  if (!findings.length) return null
  const mergedNode = { ...node, photoDraft: incomingDraft || node.photoDraft || {} }
  // 本轮已出过工单检查结论，改字后确认不再重查
  if (wantsSkip(payload) && !isAckStale(mergedNode, {})) {
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
    incomingDraft,
    extra: { step: plan.step },
  })
  return {
    completed: false,
    nextAction: 'ai_review',
    review,
    message: '正在检查',
  }
}

async function maybeHoldDeliverForAiReview({ album, node, merchantId, payload = {} }) {
  // 送达即车主可见：expose 事件，查不查由决策入口统一判，不再按单据类型挑
  const plan = planNodeReview({ event: 'expose', node })
  if (!plan) return null
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
  // 报告与方案是一起发的：方案被车主拒绝过，报告这份同样要重查（结论早于拒绝就算作废）
  const quoteNode = readFlowNodes(album).find(
    (item) => item && item.kind === 'quote_confirm' && !item.insertedReason,
  )
  const rejectedAt = String(
    (quoteNode && quoteNode.document && quoteNode.document.ownerRejectedAt) || '',
  )
  if (wantsSkip(payload) && !isAckStale(mergedNode, { quoteLines, rejectedAt })) {
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
    // 显式写入口径：送达时排队若不写，执行端就推不出该查什么
    extra: {
      quoteLines,
      step: plan.step,
      skipEngineId: text(quoteNode && quoteNode.quoteAssist && quoteNode.quoteAssist.generateEngine),
    },
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

/** 报价页点「AI检查」：只排队核对，不发给车主 */
async function maybeStartAiReview({ album, node, merchantId, payload = {} }) {
  const plan = planNodeReview({ event: 'expose', node })
  if (!plan) return null
  const capability = await resolveCapabilityForMerchant(merchantId)
  if (!capability.entitled) {
    return { delivered: false, nextAction: '', review: null, skipped: true, message: '' }
  }
  const kind = String((node && node.kind) || '')
  const doc = (node.document && node.document.payload) || {}
  const quoteNode = readFlowNodes(album).find(
    (item) => item && item.kind === 'quote_confirm' && !item.insertedReason,
  )
  const quoteFromAlbum =
    (quoteNode && quoteNode.document && quoteNode.document.payload && quoteNode.document.payload.lines) || []
  const quoteLines =
    kind === 'quote_confirm' && Array.isArray(doc.lines)
      ? doc.lines
      : Array.isArray(payload.quoteLines) && payload.quoteLines.length
        ? payload.quoteLines
        : quoteFromAlbum
  const review = await startOrResumeReview({
    album,
    node,
    merchantId,
    extra: {
      step: plan.step,
      quoteLines,
      skipEngineId: text(quoteNode && quoteNode.quoteAssist && quoteNode.quoteAssist.generateEngine),
    },
  })
  return {
    delivered: false,
    nextAction: 'ai_review',
    review,
    message: '正在检查',
  }
}

/** 发给车主前查一次（expose 事件） */
async function maybeHoldNotifyForAiReview({ album, node, merchantId, payload = {} }) {
  const kind = String((node && node.kind) || '')
  const plan = planNodeReview({ event: 'expose', node })
  if (!plan) return null
  const capability = await resolveCapabilityForMerchant(merchantId)
  if (!capability.entitled) {
    console.info('[node-ai-review] 跳过检查：能力未开通', { kind, merchantId })
    return null
  }
  const doc = (node.document && node.document.payload) || {}
  const quoteLines = kind === 'quote_confirm' && Array.isArray(doc.lines) ? doc.lines : []
  if (wantsSkip(payload) && !isAckStale(node, { quoteLines })) {
    console.info('[node-ai-review] 放行：本轮已看过检查结论', { kind, nodeId: node.id })
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
  const quoteNodeForSkip = readFlowNodes(album).find(
    (item) => item && item.kind === 'quote_confirm' && !item.insertedReason,
  )
  const review = await startOrResumeReview({
    album,
    node,
    merchantId,
    extra: {
      step: plan.step,
      quoteLines,
      skipEngineId: text(
        quoteNodeForSkip && quoteNodeForSkip.quoteAssist && quoteNodeForSkip.quoteAssist.generateEngine,
      ),
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
  maybeHoldDeliverForAiReview,
  maybeHoldNotifyForAiReview,
  maybeStartAiReview,
  maybeHoldWorkSheetForReview,
  getNodeAiReview,
  flushQueuedNodeAiReviewsForAlbum,
  runNodeAiReviewJob,
}
