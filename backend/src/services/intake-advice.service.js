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

function intakePhotoUrls(intake) {
  const draft = (intake && intake.photoDraft) || {}
  const urls = []
  const push = (raw) => {
    const url = text(typeof raw === 'object' && raw ? raw.url || raw.rawUrl || raw.maskedUrl : raw)
    if (!/^https?:\/\//.test(url) || urls.includes(url) || urls.length >= 6) return
    urls.push(url)
  }
  ;(Array.isArray(draft.pendingImages) ? draft.pendingImages : []).forEach(push)
  return urls
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
        v: 'coverage',
        c: intakeComplaintText(intake),
        p: intakePhotoUrls(intake),
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

async function runGenerateLlm(urls) {
  const engines = resolveConfiguredNodeAiReviewEngines()
  if (!engines.length) return null
  const { chatCompletion } = require('../lib/dashscope-chat')
  const { responsesCompletion } = require('../lib/responses-chat')
  const instruction = [
    '你在看接车时拍的车身照片。只判断车头、车尾、左侧、右侧有没有入镜。',
    '某一侧完全没出现，放进 missing。值只能是：车头、车尾、左侧、右侧。',
    '看不清是哪一侧，就不要猜，不要放进 missing。',
    '不要写损伤部位、深浅、特写，不要改车主诉求，不要写检测或保养。',
    '四周都能看到时 missing 为空数组。',
    '输出 JSON：{"missing":[]}',
  ].join('\n')
  const content = [{ type: 'text', text: instruction }].concat(
    (urls || []).flatMap((url, index) => [
      { type: 'text', text: `第 ${index + 1} 张` },
      { type: 'image_url', image_url: { url } },
    ]),
  )

  for (const engine of engines) {
    try {
      const callModel = engine.protocol === 'responses' ? responsesCompletion : chatCompletion
      const result = await callModel({
        apiUrl: engine.apiUrl,
        apiKey: engine.apiKey,
        model: engine.model,
        messages: [
          { role: 'system', content: '只输出 JSON。' },
          { role: 'user', content: content },
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
    const urls = intakePhotoUrls(intake)
    const parsed = urls.length ? await runGenerateLlm(urls) : null
    await patchIntakeNode(albumId, (item) => ({
      ...item,
      intakeAdvice: !urls.length || parsed
        ? {
            status: 'ready',
            scope: 'coverage',
            fingerprint,
            noPhotos: !urls.length,
            covered: parsed ? parsed.covered : false,
            diagnosis: '',
            photoTips: [],
            askOwner: [],
            checkpoints: [],
            risks: parsed ? parsed.risks : [],
            fixes: parsed ? parsed.fixes : [],
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
