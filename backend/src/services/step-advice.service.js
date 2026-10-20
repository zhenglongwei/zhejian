/**
 * 施工、交车的 AI 分析。
 * 前面各步只带已经生成的文字。本步文字和照片没变就复用上次结果。不重新看旧照片。
 */
const crypto = require('crypto')
const { prisma } = require('../lib/prisma')
const { FLOW_VERSION } = require('../../vendor/shared/constants/service-flow-nodes')
const { parseReviewModelJson } = require('../utils/node-ai-review-rules')
const { resolveConfiguredNodeAiReviewEngines } = require('../lib/node-ai-review-llm-registry')

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

function linesOf(node) {
  const payload = (node && node.document && node.document.payload) || {}
  return (Array.isArray(payload.lines) ? payload.lines : [])
    .map((row) => ({
      name: text(row && row.name),
      amount: text(row && row.amount),
      note: text(row && row.note),
    }))
    .filter((row) => row.name)
}

function workRows(node) {
  const findings = (node && node.photoDraft && node.photoDraft.findings) || []
  return (Array.isArray(findings) ? findings : []).map((row) => ({
    name: text(row && row.partName),
    note: text(row && (row.caption || row.advice)),
    photos: Array.isArray(row && row.images) ? row.images.length : row && row.url ? 1 : 0,
  })).filter((row) => row.name || row.note || row.photos)
}

function clipItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const title = text(raw.title).slice(0, 16)
  const body = text(raw.body || raw.text).slice(0, 80)
  if (!title && !body) return null
  return { title, body }
}

function parseWorkAdvice(raw) {
  const parsed = parseReviewModelJson(raw)
  if (!parsed) return { note: '', gaps: [] }
  const gaps = (Array.isArray(parsed.gaps) ? parsed.gaps : [])
    .map((row) => {
      const item = clipItem(row)
      if (!item) return null
      const action = text(row && row.action) === 'photo' ? 'photo' : 'addon'
      return { ...item, action }
    })
    .filter(Boolean)
    .slice(0, 4)
  const note = gaps.length ? '' : text(parsed.note).slice(0, 40) || '和报价对得上'
  return { note, gaps }
}

function parseDeliveryAdvice(raw) {
  const parsed = parseReviewModelJson(raw)
  if (!parsed) return { repair: null, warranty: null, care: null }
  return {
    repair: clipItem(parsed.repair),
    warranty: clipItem(parsed.warranty),
    care: clipItem(parsed.care),
  }
}

function filled(item) {
  return Boolean(item && text(item.body))
}

function adviceHasContent(advice, kind) {
  if (!advice || typeof advice !== 'object') return false
  if (kind === 'work') return Boolean(text(advice.note) || (advice.gaps && advice.gaps.length))
  return Boolean(filled(advice.repair) || filled(advice.warranty) || filled(advice.care))
}

function namedRows(findings) {
  return (Array.isArray(findings) ? findings : [])
    .map((row) => ({
      name: text(row && row.partName),
      note: text(row && (row.advice || row.caption)),
    }))
    .filter((row) => row.name || row.note)
}

function contextOf(album) {
  const nodes = readFlowNodes(album)
  const intake = nodes.find((item) => item && (item.kind === 'intake' || item.kind === 'intake_inspection'))
  const inspection = nodes.find((item) => item && item.kind === 'inspection')
  const quotes = nodes.filter((item) => item && item.kind === 'quote_confirm')
  const works = nodes.filter((item) => item && item.kind === 'work')
  const delivery = nodes.find((item) => item && item.kind === 'delivery_photos')
  const repair = nodes.find((item) => item && item.kind === 'repair_report')
  const draft = (delivery && delivery.photoDraft) || {}
  const reportPayload = (repair && repair.document && repair.document.payload) || {}
  const intakeAdvice = (intake && intake.intakeAdvice) || {}
  const workAdvice = (works.find((item) => item.workAdvice) || {}).workAdvice || {}
  return {
    complaint: text(intake && intake.photoDraft && intake.photoDraft.chiefComplaint),
    intakeRisks: (Array.isArray(intakeAdvice.risks) ? intakeAdvice.risks : [])
      .map((row) => text(row && row.title))
      .filter(Boolean),
    inspectItems: namedRows(inspection && inspection.photoDraft && inspection.photoDraft.findings),
    quoteLines: quotes.reduce((all, node) => all.concat(linesOf(node)), []),
    workItems: works.reduce((all, node) => all.concat(workRows(node)), []),
    warrantyPeriod: text(draft.warrantyPeriod || reportPayload.warrantyPeriod),
    warrantyNotes: text(draft.warrantyNotes || reportPayload.warrantyNotes),
    hasExterior: Boolean(text(draft.deliveryExteriorUrl)),
    selectedCount: Array.isArray(draft.selectedDeliveryUrls) ? draft.selectedDeliveryUrls.length : 0,
    workAdviceAt: text(workAdvice.updatedAt),
  }
}

function fingerprintFor(kind, ctx) {
  const picked = kind === 'work'
    ? {
        complaint: ctx.complaint,
        intakeRisks: ctx.intakeRisks,
        inspectItems: ctx.inspectItems,
        quoteLines: ctx.quoteLines,
        workItems: ctx.workItems,
      }
    : {
        complaint: ctx.complaint,
        quoteLines: ctx.quoteLines,
        workItems: ctx.workItems,
        warrantyPeriod: ctx.warrantyPeriod,
        warrantyNotes: ctx.warrantyNotes,
        hasExterior: ctx.hasExterior,
        selectedCount: ctx.selectedCount,
        workAdviceAt: ctx.workAdviceAt,
      }
  return crypto.createHash('sha1').update(JSON.stringify({ v: kind, ...picked })).digest('hex')
}

async function patchNode(albumId, kind, mutator) {
  const album = await prisma.album.findUnique({ where: { id: albumId } })
  if (!album) return null
  const pkg = album.contentPackageJson && typeof album.contentPackageJson === 'object' ? album.contentPackageJson : {}
  const nodes = sortFlowNodes(pkg.flowNodes)
  const index = nodes.findIndex((item) => item && item.kind === kind)
  if (index < 0) return null
  nodes[index] = mutator(nodes[index]) || nodes[index]
  await prisma.album.update({
    where: { id: albumId },
    data: { contentPackageJson: { ...pkg, flowVersion: FLOW_VERSION, flowNodes: nodes } },
  })
  return nodes[index]
}

async function runLlm(instruction) {
  const engines = resolveConfiguredNodeAiReviewEngines()
  if (!engines.length) return null
  const { chatCompletion } = require('../lib/dashscope-chat')
  const { responsesCompletion } = require('../lib/responses-chat')
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
        timeoutMs: Math.min(Number(engine.timeoutMs || 60000), 45000),
      })
      return result && result.text
    } catch (_) {
      /* 换下一家 */
    }
  }
  return null
}

function workInstruction(ctx) {
  return [
    '你在看施工和已确认报价是否一致。只根据下面的文字，不要再看照片，不要改金额。',
    '报价里有、施工里没有图或说明的：action 用 photo，title 写项目名，body 写补哪一项的施工图。',
    '施工里多出来、报价里没有的：action 用 addon，body 写去补充报价。',
    '都对得上：gaps 为空，note 写「和报价对得上」。',
    '最多 4 条。不要编没写过的项目。',
    `本单：${JSON.stringify({
      complaint: ctx.complaint,
      intakeRisks: ctx.intakeRisks,
      inspectItems: ctx.inspectItems,
      quoteLines: ctx.quoteLines,
      workItems: ctx.workItems,
    })}`,
    '输出 JSON：{"note":"","gaps":[{"title":"","body":"","action":"photo"}]}',
  ].join('\n')
}

function deliveryInstruction(ctx) {
  return [
    '你在看交车。只根据已经做好的项目和店员写的质保，给店员三句。',
    'repair：这次做成了什么。warranty：质保还缺不缺；已经写了就说按已写的。care：之后用车要注意的一句，必须对着这次的项目。',
    '不要编保养周期，不要编没写过的年限，不要改报价。',
    `本单：${JSON.stringify({
      complaint: ctx.complaint,
      quoteLines: ctx.quoteLines,
      workItems: ctx.workItems,
      warrantyPeriod: ctx.warrantyPeriod,
      warrantyNotes: ctx.warrantyNotes,
    })}`,
    '输出 JSON：{"repair":{"title":"这次维修","body":""},"warranty":{"title":"质保","body":""},"care":{"title":"用车","body":""}}',
  ].join('\n')
}

async function runJob(albumId, kind) {
  const key = `${kind}-advice:${albumId}`
  if (jobsInFlight.has(key)) return
  jobsInFlight.add(key)
  try {
    const { loadAlbum } = require('./service-album.service')
    const album = await loadAlbum(albumId)
    if (!album) return
    const ctx = contextOf(album)
    const fingerprint = fingerprintFor(kind, ctx)
    const field = kind === 'work' ? 'workAdvice' : 'deliveryAdvice'
    const nodeKind = kind === 'work' ? 'work' : 'delivery_photos'
    const raw = await runLlm(kind === 'work' ? workInstruction(ctx) : deliveryInstruction(ctx))
    const parsed = kind === 'work' ? parseWorkAdvice(raw) : parseDeliveryAdvice(raw)
    const ok = adviceHasContent(parsed, kind)
    await patchNode(albumId, nodeKind, (item) => ({
      ...item,
      [field]: ok
        ? { status: 'ready', fingerprint, ...parsed, errorMessage: '', updatedAt: new Date().toISOString() }
        : { ...(item[field] || {}), status: 'failed', fingerprint, errorMessage: '未能出意见', updatedAt: new Date().toISOString() },
    }))
  } finally {
    jobsInFlight.delete(key)
  }
}

async function queueIfNeeded(album, kind) {
  const { resolveCapabilityForMerchant } = require('./node-ai-review.service')
  const capability = await resolveCapabilityForMerchant(album.merchantId)
  if (!capability || !capability.entitled || !capability.llmEnabled) return { queued: false, skipped: true }
  const ctx = contextOf(album)
  if (kind === 'work' && !ctx.quoteLines.length && !ctx.workItems.length) {
    const err = new Error('先有报价或施工项')
    err.status = 400
    throw err
  }
  const fingerprint = fingerprintFor(kind, ctx)
  const field = kind === 'work' ? 'workAdvice' : 'deliveryAdvice'
  const nodeKind = kind === 'work' ? 'work' : 'delivery_photos'
  const node = readFlowNodes(album).find((item) => item && item.kind === nodeKind)
  const current = (node && node[field]) || {}
  if (current.status === 'ready' && current.fingerprint === fingerprint && adviceHasContent(current, kind)) {
    return { queued: false, reuse: true }
  }
  await patchNode(album.id, nodeKind, (item) => ({
    ...item,
    [field]: { status: 'queued', fingerprint, updatedAt: new Date().toISOString() },
  }))
  setImmediate(() => {
    runJob(album.id, kind).catch(() => {})
  })
  return { queued: true }
}

function sanitizeStepAdviceForView(advice, kind) {
  if (!advice || typeof advice !== 'object' || !text(advice.status)) return null
  const status = text(advice.status)
  const base = {
    status,
    isWaiting: status === 'queued' || status === 'running',
    errorMessage: status === 'failed' ? text(advice.errorMessage) || '未能出意见' : '',
    updatedAt: text(advice.updatedAt),
  }
  if (kind === 'work') {
    return { ...base, note: text(advice.note), gaps: Array.isArray(advice.gaps) ? advice.gaps : [] }
  }
  return {
    ...base,
    repair: advice.repair || null,
    warranty: advice.warranty || null,
    care: advice.care || null,
  }
}

module.exports = {
  queueWorkAdviceIfNeeded: (album) => queueIfNeeded(album, 'work'),
  queueDeliveryAdviceIfNeeded: (album) => queueIfNeeded(album, 'delivery'),
  sanitizeStepAdviceForView,
  parseWorkAdvice,
  parseDeliveryAdvice,
}
