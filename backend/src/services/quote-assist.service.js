/**
 * 检测确认后出建议报价；失败回落类目规则
 * 真源：docs/04_维修过程相册/26_ §4.2.1
 */
const crypto = require('crypto')
const { prisma } = require('../lib/prisma')
const { FLOW_VERSION } = require('../../vendor/shared/constants/service-flow-nodes')
const { resolveShared } = require('../utils/resolve-shared')
const { vehicleAnchor } = require('../utils/vehicle-anchor')
const { MECHANIC_VOICE_RULES } = require('../utils/mechanic-copy-voice')
const {
  parseQuoteAssistPayload,
  sanitizeQuoteAssistForView,
  quoteAssistHasContent,
  lineHasMarketBand,
  refineDispositionScope,
  dispositionLabel,
} = require('../utils/quote-assist')
const { resolveConfiguredNodeAiReviewEngines } = require('../lib/node-ai-review-llm-registry')

const {
  buildQuoteDraft,
  contentOfFlowNode,
  collectQuotedLines,
} = resolveShared('utils/service-flow-docs.js')

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

/** 报价类节点（含旧数据的 addon_quote_confirm） */
function isQuoteNode(node) {
  return Boolean(node && (node.kind === 'quote_confirm' || node.kind === 'addon_quote_confirm'))
}

/** 报价类节点：优先按 id 精确找（补充报价），否则回落首次报价 */
function findQuoteTarget(nodes, nodeId) {
  const list = Array.isArray(nodes) ? nodes : []
  if (nodeId) {
    const hit = list.find((item) => item && item.id === nodeId && isQuoteNode(item))
    if (hit) return hit
  }
  return list.find((item) => item && item.kind === 'quote_confirm' && !item.insertedReason) || null
}

function isAddonQuote(node) {
  if (!node) return false
  return String(node.insertedReason || '') === 'addon' || node.kind === 'addon_quote_confirm'
}

function quoteLinesOf(node) {
  const bag = contentOfFlowNode(node)
  return (Array.isArray(bag.lines) ? bag.lines : [])
    .map((row) => ({
      id: text(row && row.id),
      name: text(row && row.name),
      amount: text(row && row.amount),
      note: text(row && row.note),
      brand: text(row && row.brand),
    }))
    .filter((row) => row.name)
}

/** 施工阶段记录的全部工单项（补充报价的唯一依据） */
function collectWorkFindings(nodes) {
  const rows = []
  ;(Array.isArray(nodes) ? nodes : []).forEach((node) => {
    if (!node || node.kind !== 'work') return
    const findings = contentOfFlowNode(node).findings
    ;(Array.isArray(findings) ? findings : []).forEach((row) => {
      const partName = text(row && row.partName)
      const caption = text(row && (row.caption || row.advice)).slice(0, 80)
      if (!partName && !caption) return
      rows.push({
        partName,
        caption,
        photos: Array.isArray(row && row.images) ? row.images.length : 0,
        quoteLineId: text(row && row.quoteLineId),
        outsideQuote: Boolean(row && row.outsideQuote),
      })
    })
  })
  return rows
}

/** 补充报价单上的「新发现」：说明 + 照片（图可能是字符串或 {url, maskedUrl}） */
function addonDiscoveryOf(node) {
  const bag = contentOfFlowNode(node)
  const discovery = bag.discovery && typeof bag.discovery === 'object' ? bag.discovery : {}
  const images = (Array.isArray(discovery.images) ? discovery.images : [])
    .map((row) => text(typeof row === 'string' ? row : row && (row.url || row.rawUrl || row.src)))
    .filter(Boolean)
  return { note: text(discovery.note).slice(0, 300), images }
}

function buildAssistFingerprint(album, targetNode) {
  const nodes = readFlowNodes(album)
  const target = targetNode || findQuoteTarget(nodes)
  if (isAddonQuote(target)) {
    const discovery = addonDiscoveryOf(target)
    return crypto
      .createHash('sha1')
      .update(
        JSON.stringify({
          v: 'addon-assist-v4',
          vh: vehicleAnchor(album.vehicleJson),
          id: text(target.id),
          d: { note: discovery.note, images: discovery.images },
          w: collectWorkFindings(nodes),
          q: collectQuotedLines(nodes, { excludeNodeId: target.id }),
          t: quoteLinesOf(target),
        }),
      )
      .digest('hex')
  }
  const intake = nodes.find((item) => item && (item.kind === 'intake' || item.kind === 'intake_inspection'))
  const report = nodes.find((item) => item && item.kind === 'inspection_report')
  const quote = target || nodes.find((item) => item && item.kind === 'quote_confirm' && !item.insertedReason)
  const reportContent = report ? contentOfFlowNode(report) : {}
  const findings = Array.isArray(reportContent.findings) ? reportContent.findings : []
  const quoteContent = quote ? contentOfFlowNode(quote) : {}
  const lines = Array.isArray(quoteContent.lines) ? quoteContent.lines : []
  const intakeDraft = contentOfFlowNode(intake)
  const intakePhotos = Array.isArray(intakeDraft.pendingImages) ? intakeDraft.pendingImages : []
  return crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        v: 'quote-assist-v3',
        vh: vehicleAnchor(album.vehicleJson),
        c: text(intakeDraft.chiefComplaint || reportContent.chiefComplaint),
        intake: text((intake && intake.intakeAdvice && intake.intakeAdvice.updatedAt) || ''),
        p: intakePhotos.map((img) => text(img && (img.url || img))),
        f: findings.map((row) => ({
          p: text(row && row.partName),
          r: text(row && row.result),
          a: text(row && row.advice),
        })),
        q: lines.map((row) => ({
          id: text(row && row.id),
          n: text(row && row.name),
          a: text(row && row.amount),
          note: text(row && row.note),
          brand: text(row && row.brand),
        })),
      }),
    )
    .digest('hex')
}

async function patchQuoteNode(albumId, nodeId, mutator) {
  const album = await prisma.album.findUnique({ where: { id: albumId } })
  if (!album) return null
  const pkg =
    album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? album.contentPackageJson
      : {}
  const nodes = sortFlowNodes(pkg.flowNodes)
  const index = nodeId
    ? nodes.findIndex((item) => item && item.id === nodeId && isQuoteNode(item))
    : nodes.findIndex((item) => item && item.kind === 'quote_confirm' && !item.insertedReason)
  if (index < 0) return null
  nodes[index] = mutator(nodes[index], nodes) || nodes[index]
  await prisma.album.update({
    where: { id: albumId },
    data: { contentPackageJson: { ...pkg, flowVersion: FLOW_VERSION, flowNodes: nodes } },
  })
  return nodes[index]
}

function pickGenerateEngines() {
  return resolveConfiguredNodeAiReviewEngines()
}

/**
 * 报价 AI 的检测依据：
 * 1) 检测报告已生成 → 直接用报告节点 content.findings
 * 2) 报告还没生成（status=in_progress，content 为空）→ 回落到检测节点的 items
 * 3) items 也为空（inspect_v2 目前恒空）→ 用 suggestOrder（建议补充检测）当待报价项
 */
function resolveQuoteFindings(payload, inspectionAdvice) {
  const reportRows = Array.isArray(payload && payload.findings) ? payload.findings : []
  if (reportRows.length) return { source: 'report', rows: reportRows }

  const items = Array.isArray(inspectionAdvice && inspectionAdvice.items) ? inspectionAdvice.items : []
  const fromItems = items
    .map((row) => ({
      partName: text(row && (row.partName || row.name || row.title)),
      result: text(row && (row.result || row.status)),
      advice: text(row && (row.advice || row.body || row.note)),
    }))
    .filter((row) => row.partName || row.result)
  if (fromItems.length) return { source: 'inspection_items', rows: fromItems }

  const order = Array.isArray(inspectionAdvice && inspectionAdvice.inspectOrder)
    ? inspectionAdvice.inspectOrder
    : []
  const fromOrder = order
    .map((row) => ({
      partName: text(typeof row === 'string' ? row : row && (row.partName || row.name || row.title)),
      result: '',
      advice: '',
    }))
    .filter((row) => row.partName)
  return { source: fromOrder.length ? 'inspect_order' : 'none', rows: fromOrder }
}

async function runGenerateLlm(facts, category) {
  const engines = pickGenerateEngines()
  if (!engines.length) return null
  const { chatCompletion } = require('../lib/dashscope-chat')
  const { responsesCompletion } = require('../lib/responses-chat')
  const instruction = [
    'You assist a Chinese auto shop clerk on the quote step.',
    'Goal: using inspectionAdvice + current quote lines, produce per-line quote reference (market bands + reason) and supplements. The reason field IS the necessity analysis (answers why the owner should do it). Do NOT output separate objections/FAQ/photoPlan blocks.',
    'Hard rules:',
    '- Use inspectionAdvice as context. Do not restate intake photo-coverage.',
    '- If quote.lines is non-empty: one suggestedLines row per existing line (same name).',
    '- If quote.lines is EMPTY: suggestedLines MUST be the proposed quote rows (one row = one concrete billable service, name + market bands + reason). Do NOT leave suggestedLines empty and dump everything into omissions — an empty suggestedLines makes the whole suggestion invalid.',
    '- findingsSource tells you where findings came from: "report" = confirmed inspection results; "inspection_items"/"inspect_order" = the report is not generated yet, so these are inspection-backed items still to be quoted. Never invent confirmed defects when findingsSource is not "report"; phrase reason as 需拆检确认/检测已列入.',
    '- inspectionAdvice.imageNotes are per-photo findings from the inspection step; use them for reason text but never mention 图1/画面/图中.',
    '- facts.vehicle is the car registered on this album (brand/series/year/model/displacement/engine/gearbox/mileage). Use it only to keep the quote consistent with the car actually in the shop: skip items irrelevant to its powertrain, and when a line spec or fluid conflicts with it (e.g. 登记变速箱 8AT，油品却按 CVT 报), say 需核对 in reason. Never derive defects or prices from the vehicle alone; unknown bands stay empty.',
    '- Every suggestedLines row: name, short note, kind=parts|labor, reason (报价原因), optional boolean.',
    '- kind=parts (parts OR materials: oil, paint, filters, bushings, etc.): oem/brand/economy ranges like "约800-1500"; leave dealer/indie empty.',
    '- kind=labor (teardown, diagnosis, labor-hour, alignment — no part brand): dealer (4S) and indie (修理厂) ranges; leave oem/brand/economy empty.',
    '- Mixed replace+labor → kind=parts. Watch/optional items: optional=true and reason must say 可由车主选择.',
    '- omissions: inspection-backed billable items missing from the quote table. Same object shape as suggestedLines. One object = one concrete service name that can be written into the quote table (e.g. 更换机油机滤, 火花塞, 节气门清洗). Include market bands + reason. Never use umbrella titles like 建议补充常规保养项目 / 常规保养 / 以下项目. Never pack multiple services into one prose body. Never auto-add lines; the clerk applies each row separately.',
    '- Accident cars: leave all band fields empty. Skip 状态良好 / 仅记录 as charge lines. Closed packages keep the package main line.',
    '- Simplified Chinese only in natural-language values. No colloquial section titles.',
    MECHANIC_VOICE_RULES,
    `Category constraint: ${JSON.stringify(facts.constraint)}`,
    `Job facts JSON: ${JSON.stringify(facts.body)}`,
    'Return JSON only: {"suggestedLines":[{"name","note","kind":"parts|labor","oem","brand","economy","dealer","indie","reason","optional"}],"omissions":[{"name","note","kind":"parts|labor","oem","brand","economy","dealer","indie","reason","optional"}]}',
  ]
    .filter(Boolean)
    .join('\n')

  for (const engine of engines) {
    try {
      const callModel = engine.protocol === 'responses' ? responsesCompletion : chatCompletion
      const result = await callModel({
        apiUrl: engine.apiUrl,
        apiKey: engine.apiKey,
        model: engine.model,
        messages: [
          {
            role: 'system',
            content:
              'Reply with JSON only. Natural-language string values must be Simplified Chinese. Never say no advice merely because the form looks filled.',
          },
          { role: 'user', content: instruction },
        ],
        temperature: 0.2,
        responseFormat: engine.vendor === 'dashscope' ? { type: 'json_object' } : undefined,
        enableThinking: engine.vendor === 'dashscope' ? false : undefined,
        timeoutMs: Math.min(Number(engine.timeoutMs || 60000), 60000),
      })
      const parsed = parseQuoteAssistPayload(result && result.text, { category })
      // 报价表为空时，模型会把建议项放进 omissions（表里没有任何行可对齐），
      // 这时 omissions 就是「要新建的报价行」，不能因为 suggestedLines 为空就判失败。
      const bandRows = parsed.suggestedLines.length ? parsed.suggestedLines : parsed.omissions
      if (!bandRows.length) {
        console.warn('[quote-assist] 模型未给出任何建议行', { engine: engine.id })
        continue
      }
      // 有建议行但全无参考区间时换下一家，避免「市场参考价」空壳
      const hasBand = bandRows.some((row) => lineHasMarketBand(row))
      if (!hasBand) {
        console.warn('[quote-assist] 建议行全部缺少参考区间', {
          engine: engine.id,
          count: bandRows.length,
        })
        continue
      }
      return { parsed, engineId: engine.id }
    } catch (err) {
      console.warn('[quote-assist] 引擎调用失败', {
        engine: engine.id,
        message: text(err && err.message).slice(0, 200),
      })
    }
  }
  return null
}

/**
 * 补充报价 AI：新发现说明/照片 + 施工记录 + 历次报价汇总（排除已报项目）+ 当前补充报价行。
 * 先给处置结论（并入原报价 / 单独列 / 先拆检），再给逐项必要性、市场价区间、是否可选。
 */
async function runAddonGenerateLlm(facts, category) {
  const engines = pickGenerateEngines()
  if (!engines.length) return null
  const { chatCompletion } = require('../lib/dashscope-chat')
  const { responsesCompletion } = require('../lib/responses-chat')
  const instruction = [
    'You assist a Chinese auto shop clerk on the ADD-ON quote step (补充报价).',
    'Context: extra problems were found either mid-work or during handover. The add-on quote is an independent node, not an attachment to the work node.',
    'Evidence available (use all of it): discoveryNote = what the clerk wrote about the new problem; discoveryImageCount = how many photos the clerk attached; workFindings = work records; priorQuoteLines = the first quote plus OTHER non-cancelled add-on quotes, THIS add-on quote excluded (already quoted elsewhere, never re-quote); addonLines = rows already on THIS add-on quote; inspection = inspection report findings.',
    'Required output 1 — disposition: decide how to handle this discovery.',
    '- verdict "merge": the new problem can be folded into an existing line. The target may be a priorQuoteLines row, or an addonLines row when THIS add-on quote already covers the problem. Put the target line name in "target".',
    '- verdict "separate": it must be its own add-on quote line (why it cannot merge).',
    '- verdict "inspect": need teardown / more photos / a test drive before pricing.',
    '- reason: one short paragraph in owner-friendly Simplified Chinese explaining the call.',
    'Required output 2 — suggestedLines / omissions: one row per concrete billable service.',
    '- name, note, kind=parts|labor, market bands, reason (necessity: why now + risk if skipped), optional (true when the owner may decline).',
    'Hard rules:',
    '- addonLines are rows of THIS add-on quote. Never describe them as 原报价/首次报价/以往报价 in any string value.',
    '- If addonLines already covers the discovery, verdict "merge" with target = that addonLines row, and the reason must say it is already included in this add-on quote (本次补充报价) — do not suggest adding a duplicate row.',
    '- Base rows on discoveryNote + workFindings + inspection. Never invent defects with no evidence.',
    '- Exclude anything already covered by priorQuoteLines (same part or same service, even if wording differs). Never re-quote the same service.',
    '- outsideQuote=true findings qualify only when not already covered by priorQuoteLines. Findings without a matching quoteLineId follow the same rule.',
    '- Check/inspection-only findings with no repair action must NOT become charge lines.',
    '- One row = one concrete billable service. No umbrella titles such as 建议补充常规保养项目.',
    '- kind=parts: oem/brand/economy bands like "约800-1500", leave dealer/indie empty.',
    '- kind=labor: dealer and indie bands, leave oem/brand/economy empty.',
    '- reason must not mention 图1/画面/图中.',
    '- facts.vehicle is the car registered on this album (brand/series/year/model/displacement/engine/gearbox/mileage). Use it only to keep rows consistent with that car: skip anything irrelevant to its powertrain, and flag 需核对 in reason when a spec or fluid conflicts with it. Never derive defects or prices from the vehicle alone.',
    '- If addonLines already has rows: suggestedLines should align one row per existing line (same name). Put remaining qualifying rows into omissions.',
    '- If addonLines is empty: put all qualifying rows into suggestedLines.',
    '- If discoveryNote is empty and discoveryImageCount is 0 and no qualifying work finding exists: return verdict "inspect" and tell the clerk to add a description or photos. Never invent rows.',
    '- Never auto-add lines yourself. Simplified Chinese only in natural-language values.',
    MECHANIC_VOICE_RULES,
    `Category constraint: ${JSON.stringify(facts.constraint)}`,
    `Job facts JSON: ${JSON.stringify(facts.body)}`,
    'Return JSON only: {"disposition":{"verdict":"merge|separate|inspect","target":"","reason":""},"suggestedLines":[{"name","note","kind":"parts|labor","oem","brand","economy","dealer","indie","reason","optional"}],"omissions":[{"name","note","kind":"parts|labor","oem","brand","economy","dealer","indie","reason","optional"}]}',
  ]
    .filter(Boolean)
    .join('\n')

  for (const engine of engines) {
    try {
      const callModel = engine.protocol === 'responses' ? responsesCompletion : chatCompletion
      const result = await callModel({
        apiUrl: engine.apiUrl,
        apiKey: engine.apiKey,
        model: engine.model,
        messages: [
          {
            role: 'system',
            content:
              'Reply with JSON only. Natural-language string values must be Simplified Chinese. Only quote what the evidence proves.',
          },
          { role: 'user', content: instruction },
        ],
        temperature: 0.2,
        responseFormat: engine.vendor === 'dashscope' ? { type: 'json_object' } : undefined,
        enableThinking: engine.vendor === 'dashscope' ? false : undefined,
        timeoutMs: Math.min(Number(engine.timeoutMs || 60000), 60000),
      })
      const parsed = parseQuoteAssistPayload(result && result.text, { category })
      if (parsed.disposition) {
        // 合并目标落在「本次补充报价自己的行」时，不能说成"并入原报价"
        const refined = refineDispositionScope(parsed.disposition, {
          addonLines: facts.body.addonLines,
          priorQuoteLines: facts.body.priorQuoteLines,
        })
        parsed.disposition = {
          ...refined,
          verdictLabel: dispositionLabel(refined.verdict, refined.scope),
        }
      }
      const bandRows = parsed.suggestedLines.length ? parsed.suggestedLines : parsed.omissions
      const hasDisposition = Boolean(parsed.disposition && text(parsed.disposition.reason))
      if (!bandRows.length && !hasDisposition) {
        console.warn('[quote-assist] 补充报价模型未给出处置结论或建议行', { engine: engine.id })
        continue
      }
      // 有建议行但全无参考区间时换下一家；纯处置结论（先拆检/先补拍）可以没有报价行
      if (bandRows.length && !bandRows.some((row) => lineHasMarketBand(row))) {
        console.warn('[quote-assist] 补充报价建议行全部缺少参考区间', {
          engine: engine.id,
          count: bandRows.length,
        })
        continue
      }
      return { parsed, engineId: engine.id }
    } catch (err) {
      console.warn('[quote-assist] 补充报价引擎调用失败', {
        engine: engine.id,
        message: text(err && err.message).slice(0, 200),
      })
    }
  }
  return null
}

async function runQuoteAssistJob(albumId, merchantId, options = {}) {
  const nodeId = text(options && options.nodeId)
  const key = `quote-assist:${albumId}:${nodeId || 'first'}`
  if (jobsInFlight.has(key)) return
  jobsInFlight.add(key)
  try {
    const { loadAlbum } = require('./service-album.service')
    const { resolveCapabilityForMerchant } = require('./node-ai-review.service')
    const album = await loadAlbum(albumId)
    if (!album) return
    const capability = await resolveCapabilityForMerchant(merchantId || album.merchantId)
    const nodes = readFlowNodes(album)
    // 报价 AI 跟节点绑定：补充报价节点写它自己的 quoteAssist
    const quote = findQuoteTarget(nodes, nodeId)
    if (!quote) return
    const addon = isAddonQuote(quote)
    const fingerprint = buildAssistFingerprint(album, quote)
    await patchQuoteNode(albumId, quote.id, (item) => ({
      ...item,
      quoteAssist: {
        ...(item.quoteAssist || {}),
        status: 'running',
        fingerprint,
        updatedAt: new Date().toISOString(),
      },
    }))

    const report = nodes.find((item) => item && item.kind === 'inspection_report')
    const reportContent = report ? contentOfFlowNode(report) : {}
    const intake = nodes.find(
      (item) => item && (item.kind === 'intake' || item.kind === 'intake_inspection'),
    )
    const inspection = nodes.find((item) => item && item.kind === 'inspection')
    const inspectionAdvice = (inspection && inspection.inspectionAdvice) || {}
    const findingsResolved = resolveQuoteFindings(reportContent, inspectionAdvice)
    const findings = findingsResolved.rows
    if (findingsResolved.source !== 'report') {
      console.warn('[quote-assist] 检测报告未生成，检测依据回落到', {
        albumId,
        source: findingsResolved.source,
        count: findings.length,
      })
    }
    const chiefComplaint = text(contentOfFlowNode(intake).chiefComplaint || reportContent.chiefComplaint)
    const quoteLines = quoteLinesOf(quote)
    const workFindings = addon ? collectWorkFindings(nodes) : []
    const discovery = addon ? addonDiscoveryOf(quote) : { note: '', images: [] }
    const draft = buildQuoteDraft({
      findings: addon
        ? workFindings.map((row) => ({ partName: row.partName, result: '', advice: row.caption }))
        : findings,
      templateId: album.templateId,
      serviceName: album.serviceName,
    })
    let facts
    if (addon) {
      // 补充报价：施工记录是新项目依据；首报 + 以往未撤销补充报价只用于排除重复
      facts = {
        constraint: {
          category: draft.category,
          mode: 'addon',
          keepNames: (draft.lines || []).map((row) => text(row && row.name)).filter(Boolean),
        },
        body: {
          chiefComplaint,
          vehicle: vehicleAnchor(album.vehicleJson),
          discoveryNote: discovery.note,
          discoveryImageCount: discovery.images.length,
          workFindings: workFindings.slice(0, 40),
          priorQuoteLines: collectQuotedLines(nodes, { excludeNodeId: quote.id }).map((row) => ({
            name: row.name,
            amount: row.amount,
            note: row.note,
            source: row.quoteLabel,
          })),
          addonLines: quoteLines.map((row) => ({
            name: row.name,
            amount: row.amount,
            note: row.note,
          })),
          inspection: findings.slice(0, 20).map((row) => ({
            partName: text(row && row.partName),
            result: text(row && row.result),
            advice: text(row && row.advice),
          })),
        },
      }
    } else {
      facts = {
        constraint: {
          category: draft.category,
          mode: draft.mode,
          keepNames: (draft.lines || []).map((row) => text(row && row.name)).filter(Boolean),
        },
        body: {
          chiefComplaint,
          vehicle: vehicleAnchor(album.vehicleJson),
          inspectionAdvice: {
            faultAnalysis: text(inspectionAdvice.faultAnalysis),
            inspectOrder: (Array.isArray(inspectionAdvice.inspectOrder) ? inspectionAdvice.inspectOrder : [])
              .map((row) => text(row))
              .filter(Boolean)
              .concat(
                (Array.isArray(inspectionAdvice.partHints) ? inspectionAdvice.partHints : [])
                  .map((row) => [text(row && row.title), text(row && row.body)].filter(Boolean).join('：'))
                  .filter(Boolean),
              )
              .slice(0, 6),
            imageNotes: (Array.isArray(inspectionAdvice.imageNotes) ? inspectionAdvice.imageNotes : [])
              .map((row) => text(row && row.note))
              .filter(Boolean)
              .slice(0, 8),
            edits: Array.isArray(inspectionAdvice.edits)
              ? inspectionAdvice.edits
                  .map((row) => ({
                    kind: text(row && row.kind),
                    body: text(row && row.body).slice(0, 80),
                  }))
                  .filter((row) => row.body)
                  .slice(0, 8)
              : [],
          },
          // 报告未生成时这里由 resolveQuoteFindings 从检测节点回落填充
          findingsSource: findingsResolved.source,
          findings: findings.map((row, index) => ({
            index,
            partName: text(row && row.partName),
            result: text(row && row.result),
            advice: text(row && row.advice),
          })),
          quoteLines: quoteLines.map((row, index) => ({
            index,
            id: text(row && row.id),
            name: text(row && row.name),
            amount: text(row && row.amount),
            note: text(row && row.note),
            brand: text(row && row.brand),
          })),
        },
      }
    }

    let parsed = {
      summary: '',
      reportPrefill: '',
      issues: [],
      omissions: [],
      objections: [],
      suggestedLines: [],
      disposition: null,
    }
    let engineId = ''
    let status = 'failed'
    let errorMessage = ''
    // 完全没有依据时不白跑模型，直接告诉店员缺什么
    const addonEvidenceEmpty =
      addon &&
      !discovery.note &&
      !discovery.images.length &&
      !workFindings.length &&
      !quoteLines.some((row) => row.name)
    if (addonEvidenceEmpty) {
      status = 'failed'
      errorMessage = '还没有填写新发现说明或照片，补充依据后再算'
      console.warn('[quote-assist] 补充报价缺少依据，跳过生成', { albumId, nodeId: quote.id })
    } else if (capability.llmEnabled) {
      const fromModel = addon
        ? await runAddonGenerateLlm(facts, draft.category)
        : await runGenerateLlm(facts, draft.category)
      if (fromModel) {
        parsed = fromModel.parsed
        engineId = fromModel.engineId
        status = 'ready'
      } else {
        console.warn('[quote-assist] 全部引擎均未产出可用建议，置为失败', {
          albumId,
          addon,
          engines: pickGenerateEngines().map((engine) => engine.id),
          quoteLines: quoteLines.length,
          workFindings: workFindings.length,
          findings: findings.length,
          findingsSource: findingsResolved.source,
        })
        errorMessage = addon ? '没有拿到可用建议，补充说明或照片后再试' : '未能出方案'
      }
    } else {
      console.warn('[quote-assist] 当前商户未开通大模型，跳过生成', { albumId })
    }

    await prisma.album.findUnique({ where: { id: albumId } }).then(async (row) => {
      if (!row) return
      const pkg =
        row.contentPackageJson && typeof row.contentPackageJson === 'object'
          ? row.contentPackageJson
          : {}
      let nodes = sortFlowNodes(pkg.flowNodes)
      // 意见只挂 quoteAssist，不改报价表；店员点「应用」才写入项目名
      const quoteIdx = nodes.findIndex((item) => item && item.id === quote.id)
      if (quoteIdx >= 0) {
        nodes[quoteIdx] = {
          ...nodes[quoteIdx],
          quoteAssist: {
            status,
            fingerprint,
            generateEngine: engineId,
            issues: [],
            priceIssues: [],
            necessity: [],
            photoPlan: [],
            omissions: parsed.omissions || [],
            objections: [],
            suggestedLines: parsed.suggestedLines,
            disposition: parsed.disposition || null,
            errorMessage: status === 'failed' ? errorMessage || '未能出方案' : '',
            updatedAt: new Date().toISOString(),
          },
        }
      }
      await prisma.album.update({
        where: { id: albumId },
        data: { contentPackageJson: { ...pkg, flowVersion: FLOW_VERSION, flowNodes: nodes } },
      })
    })
  } finally {
    jobsInFlight.delete(key)
  }
}

function queueQuoteAssistGenerate({ albumId, merchantId, nodeId }) {
  if (!albumId) return
  setImmediate(() => {
    runQuoteAssistJob(albumId, merchantId, { nodeId }).catch(() => {})
  })
}

async function flushQueuedQuoteAssistForAlbum(albumId) {
  const { loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) return
  // 每个报价节点（首次 + 各补充报价）各自恢复未完成的任务
  const quotes = readFlowNodes(album).filter(isQuoteNode)
  for (const quote of quotes) {
    const status = quote.quoteAssist && quote.quoteAssist.status
    if (status === 'queued' || status === 'running') {
      await runQuoteAssistJob(albumId, album.merchantId || '', { nodeId: quote.id })
    }
  }
}

async function queueQuoteAssistIfNeeded(album, merchantId, options = {}) {
  const force = Boolean(options && options.force)
  const nodeId = text(options && options.nodeId)
  const { resolveCapabilityForMerchant } = require('./node-ai-review.service')
  const capability = await resolveCapabilityForMerchant(merchantId)
  if (!capability || !capability.entitled || !capability.llmEnabled) {
    return { queued: false }
  }
  const quote = findQuoteTarget(readFlowNodes(album), nodeId)
  if (!quote) return { queued: false }
  const fingerprint = buildAssistFingerprint(album, quote)
  const current = quote.quoteAssist || {}
  const hasReady = current.status === 'ready' && quoteAssistHasContent(current)
  // 有上次结果默认复用；仅 force 才重跑（改价/应用不自动重跑）
  if (hasReady && !force) {
    return {
      queued: false,
      reuse: true,
      stale: text(current.fingerprint) !== fingerprint,
    }
  }
  await patchQuoteNode(album.id, quote.id, (item) => {
    const prev = (item && item.quoteAssist) || {}
    return {
      ...item,
      quoteAssist: {
        ...prev,
        status: 'queued',
        fingerprint,
        // 刷新时保留旧意见，前端可边看边等
        generateEngine: force ? '' : prev.generateEngine || '',
        updatedAt: new Date().toISOString(),
      },
    }
  })
  queueQuoteAssistGenerate({ albumId: album.id, merchantId, nodeId: quote.id })
  return { queued: true, stale: false }
}

function pickReviewSkipEngineId(quoteNode) {
  return text(quoteNode && quoteNode.quoteAssist && quoteNode.quoteAssist.generateEngine)
}

module.exports = {
  sanitizeQuoteAssistForView,
  queueQuoteAssistGenerate,
  queueQuoteAssistIfNeeded,
  flushQueuedQuoteAssistForAlbum,
  pickReviewSkipEngineId,
  buildAssistFingerprint,
}
