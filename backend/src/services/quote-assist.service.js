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

const { buildQuoteDraft } = resolveShared('utils/service-flow-docs.js')

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
        v: 'quote-assist-v2',
        c: text(intakeDraft.chiefComplaint || payload.chiefComplaint),
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
    'You assist a Chinese auto shop clerk on the quote step.',
    'Goal: using inspectionAdvice + current quote lines, produce per-line quote reference (market bands + reason) and supplements. The reason field IS the necessity analysis (answers why the owner should do it). Do NOT output separate objections/FAQ/photoPlan blocks.',
    'Hard rules:',
    '- Use inspectionAdvice as context. Do not restate intake photo-coverage.',
    '- If quote.lines is non-empty: one suggestedLines row per existing line (same name). If empty: propose lines from inspection findings (deal amount stays empty).',
    '- Every suggestedLines row: name, short note, kind=parts|labor, reason (报价原因), optional boolean.',
    '- kind=parts (parts OR materials: oil, paint, filters, bushings, etc.): oem/brand/economy ranges like "约800-1500"; leave dealer/indie empty.',
    '- kind=labor (teardown, diagnosis, labor-hour, alignment — no part brand): dealer (4S) and indie (修理厂) ranges; leave oem/brand/economy empty.',
    '- Mixed replace+labor → kind=parts. Watch/optional items: optional=true and reason must say 可由车主选择.',
    '- omissions: inspection-backed items missing from the quote table; remind only, never auto-add as charged lines.',
    '- Accident cars: leave all band fields empty. Skip 状态良好 / 仅记录 as charge lines. Closed packages keep the package main line.',
    '- Simplified Chinese only in natural-language values. No colloquial section titles.',
    MECHANIC_VOICE_RULES,
    `Category constraint: ${JSON.stringify(facts.constraint)}`,
    `Job facts JSON: ${JSON.stringify(facts.body)}`,
    'Return JSON only: {"suggestedLines":[{"name","note","kind":"parts|labor","oem","brand","economy","dealer","indie","reason","optional"}],"omissions":[{"title","body"}]}',
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
    const inspection = readFlowNodes(album).find((item) => item && item.kind === 'inspection')
    const inspectionAdvice = (inspection && inspection.inspectionAdvice) || {}
    const quotePayload = (quote && quote.document && quote.document.payload) || {}
    const quoteLines = Array.isArray(quotePayload.lines) ? quotePayload.lines : []
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
        inspectionAdvice: {
          faultAnalysis: text(inspectionAdvice.faultAnalysis),
          inspectOrder: Array.isArray(inspectionAdvice.inspectOrder)
            ? inspectionAdvice.inspectOrder.slice(0, 6)
            : [],
          partHints: Array.isArray(inspectionAdvice.partHints)
            ? inspectionAdvice.partHints.slice(0, 6)
            : [],
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
        findings: (payload.findings || []).map((row, index) => ({
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
      // 意见只挂 quoteAssist，不改报价表；店员点「应用」才写入项目名
      const quoteIdx = nodes.findIndex((item) => item && item.kind === 'quote_confirm' && !item.insertedReason)
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
