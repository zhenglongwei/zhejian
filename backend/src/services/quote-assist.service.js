/**
 * 检测确认后出分析 + 建议报价；失败回落类目规则
 * 真源：docs/04_维修过程相册/26_ §4.2.1
 */
const crypto = require('crypto')
const { prisma } = require('../lib/prisma')
const { FLOW_VERSION } = require('../../vendor/shared/constants/service-flow-nodes')
const { resolveShared } = require('../utils/resolve-shared')
const { MECHANIC_VOICE_RULES } = require('../utils/mechanic-copy-voice')
const { parseQuoteAssistPayload, sanitizeQuoteAssistForView } = require('../utils/quote-assist')
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
  const payload = (report && report.document && report.document.payload) || {}
  const findings = Array.isArray(payload.findings) ? payload.findings : []
  return crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        c: text(
          (intake && intake.photoDraft && intake.photoDraft.chiefComplaint) || payload.chiefComplaint,
        ),
        f: findings.map((row) => ({
          p: text(row && row.partName),
          r: text(row && row.result),
          a: text(row && row.advice),
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
  const accident = category === 'accident'
  const instruction = [
    '你是汽修店员的方案助手。根据接车主诉和检测已写结果出分析稿和建议报价。不要百科，不要编没写到的损伤。',
    MECHANIC_VOICE_RULES,
    '建议报价的成交金额一律不要写。每行只给原厂/品牌/经济件宽区间，不是实时行情。',
    accident ? '事故车不要给金额档，suggestedLines 里 oem/brand/economy 留空。' : '',
    '封闭类目必须保住套餐主项；开口活只出可见需处理项和拆检，未拆开的隐藏件不要写成收费行。',
    '状态良好、仅记录、巡检类不要出行。漏项只写在 analysis.omissions，不要写进 suggestedLines。',
    '拆检行不要给原厂/品牌/经济件价档。issues/omissions/objections 必须是短句字符串，不要对象。',
    'reportPrefill 是可填进检测说明的短句，空栏才用；不要写 AI/模型。',
    `类目约束：${JSON.stringify(facts.constraint)}`,
    `本单事实：${JSON.stringify(facts.body)}`,
    '输出 JSON：{"analysis":{"summary","reportPrefill","issues":[],"omissions":[],"objections":[]},"suggestedLines":[{"name","note","oem","brand","economy"}]}',
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
          { role: 'system', content: '只输出 JSON。' },
          { role: 'user', content: instruction },
        ],
        temperature: 0.2,
        responseFormat: engine.vendor === 'dashscope' ? { type: 'json_object' } : undefined,
        enableThinking: engine.vendor === 'dashscope' ? false : undefined,
        timeoutMs: Math.min(Number(engine.timeoutMs || 60000), 60000),
      })
      const parsed = parseQuoteAssistPayload(result && result.text, { category })
      if (!parsed.suggestedLines.length && !parsed.reportPrefill && !parsed.summary) continue
      return { parsed, engineId: engine.id }
    } catch (_) {
      /* 换下一家 */
    }
  }
  return null
}

function applyAssistToNodes(nodes, parsed, album) {
  const reportIdx = nodes.findIndex((item) => item && item.kind === 'inspection_report')
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
      oem: row.oem,
      brand: row.brand,
      economy: row.economy,
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

  if (reportIdx >= 0 && text(parsed.reportPrefill)) {
    const report = nodes[reportIdx]
    const reportDoc = report.document || {}
    const reportPayload = reportDoc.payload || {}
    if (!text(reportPayload.conclusion)) {
      nodes[reportIdx] = {
        ...report,
        document: {
          ...reportDoc,
          payload: { ...reportPayload, conclusion: parsed.reportPrefill },
        },
      }
    }
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
            summary: parsed.summary,
            reportPrefill: parsed.reportPrefill,
            issues: parsed.issues,
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
