/**
 * 检测确认后出建议报价；失败回落类目规则
 * 真源：docs/04_维修过程相册/26_ §4.2.1
 */
const crypto = require('crypto')
const { prisma } = require('../lib/prisma')
const { FLOW_VERSION } = require('../../vendor/shared/constants/service-flow-nodes')
const { resolveShared } = require('../utils/resolve-shared')
const { MECHANIC_VOICE_RULES } = require('../utils/mechanic-copy-voice')
const {
  parseQuoteAssistPayload,
  sanitizeQuoteAssistForView,
  lineHasMarketBand,
} = require('../utils/quote-assist')
const { resolveConfiguredNodeAiReviewEngines } = require('../lib/node-ai-review-llm-registry')

const { normalizeQuoteLine, buildQuoteDraft } = resolveShared('utils/service-flow-docs.js')

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

function buildAssistFingerprint(album) {
  const nodes = readFlowNodes(album)
  const intake = nodes.find((item) => item && (item.kind === 'intake' || item.kind === 'intake_inspection'))
  const report = nodes.find((item) => item && item.kind === 'inspection_report')
  const quote = nodes.find((item) => item && item.kind === 'quote_confirm' && !item.insertedReason)
  const payload = (report && report.document && report.document.payload) || {}
  const findings = Array.isArray(payload.findings) ? payload.findings : []
  const quotePayload = (quote && quote.document && quote.document.payload) || {}
  const lines = Array.isArray(quotePayload.lines) ? quotePayload.lines : []
  const intakeDraft = (intake && intake.photoDraft) || {}
  const intakePhotos = Array.isArray(intakeDraft.pendingImages) ? intakeDraft.pendingImages : []
  return crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        v: 'prior',
        c: text(intakeDraft.chiefComplaint || payload.chiefComplaint),
        intake: text((intake && intake.intakeAdvice && intake.intakeAdvice.updatedAt) || ''),
        p: intakePhotos.map((img) => text(img && (img.url || img))),
        f: findings.map((row) => ({
          p: text(row && row.partName),
          r: text(row && row.result),
          a: text(row && row.advice),
        })),
        q: lines.map((row) => ({
          n: text(row && row.name),
          a: text(row && row.amount),
          note: text(row && row.note),
        })),
      }),
    )
    .digest('hex')
}

async function patchQuoteNode(albumId, mutator) {
  const album = await prisma.album.findUnique({ where: { id: albumId } })
  if (!album) return null
  const pkg =
    album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? album.contentPackageJson
      : {}
  const nodes = sortFlowNodes(pkg.flowNodes)
  const index = nodes.findIndex((item) => item && item.kind === 'quote_confirm' && !item.insertedReason)
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

async function runGenerateLlm(facts, category) {
  const engines = pickGenerateEngines()
  if (!engines.length) return null
  const { chatCompletion } = require('../lib/dashscope-chat')
  const { responsesCompletion } = require('../lib/responses-chat')
  const instruction = [
    'You assist a Chinese auto shop clerk reviewing a repair quote (or drafting suggested lines from inspection).',
    'Goal: necessity of lines, missing critical lines, price reasonableness, and which workmanship photos the shop should take later. Content over form. Never claim "no issues" only because the table has rows.',
    'The CURRENT quote table in facts is ground truth when present. Do NOT discuss items that are not on the table as billable facts.',
    'You MUST review every filled amount for being absurdly high or low for that service in a normal China independent shop; call out outliers in priceIssues.',
    'Do NOT change deal amounts on the quote table. Do NOT turn common industry talk into billable lines.',
    'For suggestedLines: set kind to parts or labor for EVERY row.',
    '- kind=parts (replace parts OR consume materials: filters, oil, paint, bushings, pads, batteries, etc.): fill oem / brand / economy as wide Chinese ranges (e.g. "约800-1500"). Leave dealer/indie empty.',
    '- kind=labor (pure ops: teardown/inspect, diagnosis, labor-hour, alignment, cleaning — no part brand): fill dealer (4S shop) and indie (independent garage) as two wide ranges. Leave oem/brand/economy empty.',
    '- Mixed replace+labor → kind=parts (brand bands already cover typical labor spread).',
    'Leave the shop deal amount empty. Reference bands required unless accident-car estimate — then leave all band fields empty and only mention in objections.',
    'Omissions stay in omissions — never as chargeable lines. Closed packages must keep the package main line. Open jobs: only visible actionable items and teardown; do not invent hidden parts.',
    'Skip 状态良好 / 仅记录 / routine inspection-only rows as charge lines.',
    MECHANIC_VOICE_RULES,
    `Category constraint: ${JSON.stringify(facts.constraint)}`,
    `Job facts JSON: ${JSON.stringify(facts.body)}`,
    'Return JSON only (Chinese strings): {"suggestedLines":[{"name","note","kind":"parts|labor","oem","brand","economy","dealer","indie"}],"priceIssues":[{"lineName","body"}],"omissions":[{"title","body","suggestAdd":true}],"necessity":[{"lineName","body"}],"photoPlan":[{"title","body"}],"objections":[{"ask","heard","ours","say"}]}',
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
      if (!parsed.suggestedLines.length) continue
      // 有建议行但全无参考区间时换下一家，避免「市场参考价」空壳
      const hasBand = parsed.suggestedLines.some((row) => lineHasMarketBand(row))
      if (!hasBand) continue
      return { parsed, engineId: engine.id }
    } catch (_) {
      /* 换下一家 */
    }
  }
  return null
}

function applyAssistToNodes(nodes, parsed, album) {
  const quoteIdx = nodes.findIndex((item) => item && item.kind === 'quote_confirm' && !item.insertedReason)
  if (quoteIdx < 0) return nodes
  const quote = nodes[quoteIdx]
  const prevDoc = quote.document || {}
  const prevPayload = prevDoc.payload || {}
  const existing = Array.isArray(prevPayload.lines) ? prevPayload.lines : []
  const hasNamed = existing.some((row) => text(row && row.name))
  const suggestedLines = (parsed.suggestedLines || []).map((row, index) => {
    const line = normalizeQuoteLine(
      { name: row.name, note: row.note, amount: '', brand: '' },
      index,
    )
    return {
      id: line.id,
      name: line.name,
      note: line.note,
    }
  })
  const nextLines = hasNamed
    ? existing
    : suggestedLines.length
      ? suggestedLines.map((row, index) =>
          normalizeQuoteLine({ name: row.name, note: row.note, amount: '', brand: '' }, index),
        )
      : existing

  nodes[quoteIdx] = {
    ...quote,
    document: {
      ...prevDoc,
      payload: {
        ...prevPayload,
        lines: nextLines,
      },
    },
  }
  return nodes
}

async function runQuoteAssistJob(albumId, merchantId) {
  const key = `quote-assist:${albumId}`
  if (jobsInFlight.has(key)) return
  jobsInFlight.add(key)
  try {
    const { loadAlbum } = require('./service-album.service')
    const { resolveCapabilityForMerchant } = require('./node-ai-review.service')
    const album = await loadAlbum(albumId)
    if (!album) return
    const capability = await resolveCapabilityForMerchant(merchantId || album.merchantId)
    const quote = readFlowNodes(album).find((item) => item && item.kind === 'quote_confirm' && !item.insertedReason)
    if (!quote) return
    const fingerprint = buildAssistFingerprint(album)
    await patchQuoteNode(albumId, (item) => ({
      ...item,
      quoteAssist: {
        ...(item.quoteAssist || {}),
        status: 'running',
        fingerprint,
        updatedAt: new Date().toISOString(),
      },
    }))

    const report = readFlowNodes(album).find((item) => item && item.kind === 'inspection_report')
    const payload = (report && report.document && report.document.payload) || {}
    const intake = readFlowNodes(album).find(
      (item) => item && (item.kind === 'intake' || item.kind === 'intake_inspection'),
    )
    const draft = buildQuoteDraft({
      findings: payload.findings || [],
      templateId: album.templateId,
      serviceName: album.serviceName,
    })
    const facts = {
      constraint: {
        category: draft.category,
        mode: draft.mode,
        keepNames: (draft.lines || []).map((row) => text(row && row.name)).filter(Boolean),
      },
      body: {
        chiefComplaint: text(
          (intake && intake.photoDraft && intake.photoDraft.chiefComplaint) || payload.chiefComplaint,
        ),
        findings: (payload.findings || []).map((row, index) => ({
          index,
          partName: text(row && row.partName),
          result: text(row && row.result),
          advice: text(row && row.advice),
        })),
      },
    }

    let parsed = {
      summary: '',
      reportPrefill: '',
      issues: [],
      omissions: [],
      objections: [],
      suggestedLines: [],
    }
    let engineId = ''
    let status = 'failed'
    if (capability.llmEnabled) {
      const fromModel = await runGenerateLlm(facts, draft.category)
      if (fromModel) {
        parsed = fromModel.parsed
        engineId = fromModel.engineId
        status = 'ready'
      }
    }

    await prisma.album.findUnique({ where: { id: albumId } }).then(async (row) => {
      if (!row) return
      const pkg =
        row.contentPackageJson && typeof row.contentPackageJson === 'object'
          ? row.contentPackageJson
          : {}
      let nodes = sortFlowNodes(pkg.flowNodes)
      if (status === 'ready') nodes = applyAssistToNodes(nodes, parsed, album)
      const quoteIdx = nodes.findIndex((item) => item && item.kind === 'quote_confirm' && !item.insertedReason)
      if (quoteIdx >= 0) {
        nodes[quoteIdx] = {
          ...nodes[quoteIdx],
          quoteAssist: {
            status,
            fingerprint,
            generateEngine: engineId,
            issues: [],
            priceIssues: parsed.priceIssues || [],
            necessity: parsed.necessity || [],
            photoPlan: parsed.photoPlan || [],
            omissions: parsed.omissions,
            objections: parsed.objections,
            suggestedLines: parsed.suggestedLines,
            errorMessage: status === 'failed' ? '未能出方案' : '',
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

function queueQuoteAssistGenerate({ albumId, merchantId }) {
  if (!albumId) return
  setImmediate(() => {
    runQuoteAssistJob(albumId, merchantId).catch(() => {})
  })
}

async function flushQueuedQuoteAssistForAlbum(albumId) {
  const { loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) return
  const quote = readFlowNodes(album).find((item) => item && item.kind === 'quote_confirm' && !item.insertedReason)
  const status = quote && quote.quoteAssist && quote.quoteAssist.status
  if (status === 'queued' || status === 'running') {
    await runQuoteAssistJob(albumId, album.merchantId || '')
  }
}

async function queueQuoteAssistIfNeeded(album, merchantId) {
  const { resolveCapabilityForMerchant } = require('./node-ai-review.service')
  const capability = await resolveCapabilityForMerchant(merchantId)
  if (!capability || !capability.entitled || !capability.llmEnabled) {
    return { queued: false }
  }
  const quote = readFlowNodes(album).find((item) => item && item.kind === 'quote_confirm' && !item.insertedReason)
  if (!quote) return { queued: false }
  const fingerprint = buildAssistFingerprint(album)
  const current = quote.quoteAssist || {}
  if (current.status === 'ready' && current.fingerprint === fingerprint) {
    return { queued: false, reuse: true }
  }
  await patchQuoteNode(album.id, (item) => ({
    ...item,
    quoteAssist: {
      status: 'queued',
      fingerprint,
      suggestedLines: [],
      issues: [],
      omissions: [],
      objections: [],
      generateEngine: '',
      updatedAt: new Date().toISOString(),
    },
  }))
  queueQuoteAssistGenerate({ albumId: album.id, merchantId })
  return { queued: true }
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
