/**
 * 接车主诉后出 AI意见
 * 真源：docs/04_维修过程相册/26_ AI意见
 */
const crypto = require('crypto')
const { prisma } = require('../lib/prisma')
const { FLOW_VERSION } = require('../../vendor/shared/constants/service-flow-nodes')
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

function vehicleFacts(album, draft = {}) {
  const vehicle = (album && (album.vehicle || album.vehicleJson)) || {}
  return {
    vehicleBrand: text(draft.vehicleBrand) || text(vehicle.brand),
    vehicleSeries: text(draft.vehicleSeries) || text(vehicle.series),
    vehicleYear: text(draft.vehicleYear) || text(vehicle.modelYear) || text(vehicle.year),
  }
}

function intakeComplaintText(intake) {
  const draft = (intake && intake.photoDraft) || {}
  const payload = (intake && intake.document && intake.document.payload) || {}
  return text(draft.chiefComplaint || payload.chiefComplaint)
}

function albumMileageKm(album) {
  const vehicle = (album && (album.vehicle || album.vehicleJson)) || {}
  return text(vehicle.mileage != null && vehicle.mileage !== '' ? vehicle.mileage : vehicle.mileageKm)
}

function intakePhotoNotes(intake) {
  const draft = (intake && intake.photoDraft) || {}
  const notes = []
  const push = (caption) => {
    const line = text(caption).slice(0, 20)
    if (!line || notes.length >= 12) return
    notes.push(line)
  }
  if (text(draft.odometerUrl)) push('仪表')
  ;(Array.isArray(draft.pendingImages) ? draft.pendingImages : []).forEach((img) => {
    push((img && img.caption) || '留证照')
  })
  return notes
}

function buildFingerprint(album) {
  const nodes = readFlowNodes(album)
  const intake = nodes.find((item) => item && (item.kind === 'intake' || item.kind === 'intake_inspection'))
  const draft = (intake && intake.photoDraft) || {}
  const vehicle = vehicleFacts(album, draft)
  return crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        v: 'evidence',
        c: intakeComplaintText(intake),
        p: intakePhotoNotes(intake),
        t: text(album && album.templateId),
        b: vehicle.vehicleBrand,
        s: vehicle.vehicleSeries,
        y: vehicle.vehicleYear,
        m: albumMileageKm(album),
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
    '你是汽修门店的接车留证助手。接车只把进店时的状态留下来，避免以后扯皮。',
    '不要写故障判断，不要写检测顺序，不要写保养周期，不要建议举升、拆检、换件。',
    '不要把雨刮、滤芯、刹车、轮胎换位这类检测或保养写进来。',
    '照片说明只用来判断留证齐不齐。不要根据没看见的画面编损伤。',
    'risks：这单留证现在站不住的地方。每条一个短标题，加一句以后会在哪扯皮。最多 4 条。没有明显缺口就少写。',
    'fixes：现在在接车这一步就能补的动作。每条一个短标题，加一句补哪张照片，或把诉求哪一句写具体。最多 4 条。',
    '只有「把部位或程度写进诉求」才给 options，2到4个短词。补照片的条目不要 options。',
    '不要写模型名，不要写 AI。',
    `本单：${JSON.stringify(facts)}`,
    '输出 JSON：{"risks":[{"title":"","body":""}],"fixes":[{"title":"","body":"","options":[]}]}',
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
    const vehicle = vehicleFacts(album, draft)
    const parsed = await runGenerateLlm({
      chiefComplaint: intakeComplaintText(intake),
      photos: intakePhotoNotes(intake),
      templateId: text(album.templateId),
      serviceName: text(album.serviceName),
      vehicleBrand: vehicle.vehicleBrand,
      vehicleSeries: vehicle.vehicleSeries,
      vehicleYear: vehicle.vehicleYear,
      mileageKm: albumMileageKm(album),
    })
    await patchIntakeNode(albumId, (item) => ({
      ...item,
      intakeAdvice: parsed
        ? {
            status: 'ready',
            fingerprint,
            diagnosis: '',
            photoTips: [],
            askOwner: [],
            checkpoints: [],
            risks: parsed.risks,
            fixes: parsed.fixes,
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
  const complaint = intakeComplaintText(intake)
  if (!complaint) {
    const err = new Error('先写车主诉求')
    err.status = 400
    throw err
  }
  if (!albumMileageKm(album)) {
    const err = new Error('建档没有里程')
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
      risks: [],
      fixes: [],
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
