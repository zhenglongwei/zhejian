/**
 * 接车主诉后出 AI意见
 * 真源：docs/04_维修过程相册/26_ AI意见
 */
const crypto = require('crypto')
const { prisma } = require('../lib/prisma')
const { FLOW_VERSION } = require('../../vendor/shared/constants/service-flow-nodes')
const { MECHANIC_VOICE_RULES } = require('../utils/mechanic-copy-voice')
const {
  parseIntakeAdvicePayload,
  sanitizeIntakeAdviceForView,
  intakeAdviceHasContent,
} = require('../utils/intake-advice')
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

function buildFingerprint(album) {
  const nodes = readFlowNodes(album)
  const intake = nodes.find((item) => item && (item.kind === 'intake' || item.kind === 'intake_inspection'))
  const draft = (intake && intake.photoDraft) || {}
  return crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        c: text(draft.chiefComplaint),
        t: text(album && album.templateId),
        b: text(draft.vehicleBrand),
        s: text(draft.vehicleSeries),
      }),
    )
    .digest('hex')
}

async function patchIntakeNode(albumId, mutator) {
  const album = await prisma.album.findUnique({ where: { id: albumId } })
  if (!album) return null
  const pkg =
    album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? album.contentPackageJson
      : {}
  const nodes = sortFlowNodes(pkg.flowNodes)
  const index = nodes.findIndex((item) => item && (item.kind === 'intake' || item.kind === 'intake_inspection'))
  if (index < 0) return null
  nodes[index] = mutator(nodes[index]) || nodes[index]
  await prisma.album.update({
    where: { id: albumId },
    data: { contentPackageJson: { ...pkg, flowVersion: FLOW_VERSION, flowNodes: nodes } },
  })
  return nodes[index]
}

async function runGenerateLlm(facts) {
  const engines = resolveConfiguredNodeAiReviewEngines()
  if (!engines.length) return null
  const { chatCompletion } = require('../lib/dashscope-chat')
  const { responsesCompletion } = require('../lib/responses-chat')
  const instruction = [
    '你是汽修店员的接车助手。根据车主主诉给出店内意见，不要百科，不要编没听到的损伤。',
    MECHANIC_VOICE_RULES,
    '给店员看：可能什么问题、留证怎么拍、建议按什么顺序查哪些点、还要不要再问车主几句。',
    '不要写成必须填完的检测表。checkpoints 每条要有部位名和一句为什么查。',
    '不要写模型名、不要写 AI。',
    `本单：${JSON.stringify(facts)}`,
    '输出 JSON：{"diagnosis":"","photoTips":[{"title","body"}],"askOwner":[{"title","body"}],"checkpoints":[{"partName","why"}]}',
  ].join('\n')

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
      const parsed = parseIntakeAdvicePayload(result && result.text)
      if (!intakeAdviceHasContent(parsed)) continue
      return parsed
    } catch (_) {
      /* 换下一家 */
    }
  }
  return null
}

async function runIntakeAdviceJob(albumId) {
  const key = `intake-advice:${albumId}`
  if (jobsInFlight.has(key)) return
  jobsInFlight.add(key)
  try {
    const { loadAlbum } = require('./service-album.service')
    const album = await loadAlbum(albumId)
    if (!album) return
    const intake = readFlowNodes(album).find(
      (item) => item && (item.kind === 'intake' || item.kind === 'intake_inspection'),
    )
    if (!intake) return
    const fingerprint = buildFingerprint(album)
    await patchIntakeNode(albumId, (item) => ({
      ...item,
      intakeAdvice: {
        ...(item.intakeAdvice || {}),
        status: 'running',
        fingerprint,
        updatedAt: new Date().toISOString(),
      },
    }))
    const draft = intake.photoDraft || {}
    const parsed = await runGenerateLlm({
      chiefComplaint: text(draft.chiefComplaint),
      templateId: text(album.templateId),
      serviceName: text(album.serviceName),
      vehicleBrand: text(draft.vehicleBrand),
      vehicleSeries: text(draft.vehicleSeries),
      vehicleYear: text(draft.vehicleYear),
    })
    await patchIntakeNode(albumId, (item) => ({
      ...item,
      intakeAdvice: parsed
        ? {
            status: 'ready',
            fingerprint,
            diagnosis: parsed.diagnosis,
            photoTips: parsed.photoTips,
            askOwner: parsed.askOwner,
            checkpoints: parsed.checkpoints,
            errorMessage: '',
            updatedAt: new Date().toISOString(),
          }
        : {
            ...(item.intakeAdvice || {}),
            status: 'failed',
            fingerprint,
            errorMessage: '未能出意见',
            updatedAt: new Date().toISOString(),
          },
    }))
  } finally {
    jobsInFlight.delete(key)
  }
}

async function queueIntakeAdviceIfNeeded(album, merchantId) {
  const { resolveCapabilityForMerchant } = require('./node-ai-review.service')
  const capability = await resolveCapabilityForMerchant(merchantId || album.merchantId)
  if (!capability || !capability.entitled || !capability.llmEnabled) {
    return { queued: false, skipped: true }
  }
  const intake = readFlowNodes(album).find(
    (item) => item && (item.kind === 'intake' || item.kind === 'intake_inspection'),
  )
  if (!intake) return { queued: false }
  const complaint = text(intake.photoDraft && intake.photoDraft.chiefComplaint)
  if (!complaint) {
    const err = new Error('先写问诊登记')
    err.status = 400
    throw err
  }
  const fingerprint = buildFingerprint(album)
  const current = intake.intakeAdvice || {}
  if (current.status === 'ready' && current.fingerprint === fingerprint && intakeAdviceHasContent(current)) {
    return { queued: false, reuse: true }
  }
  await patchIntakeNode(album.id, (item) => ({
    ...item,
    intakeAdvice: {
      status: 'queued',
      fingerprint,
      diagnosis: '',
      photoTips: [],
      askOwner: [],
      checkpoints: [],
      updatedAt: new Date().toISOString(),
    },
  }))
  setImmediate(() => {
    runIntakeAdviceJob(album.id).catch(() => {})
  })
  return { queued: true }
}

module.exports = {
  queueIntakeAdviceIfNeeded,
  sanitizeIntakeAdviceForView,
  runIntakeAdviceJob,
}
