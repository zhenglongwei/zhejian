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

function intakePhotoUrls(intake, options = {}) {
  const draft = (intake && intake.photoDraft) || {}
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 8
  const urls = []
  const push = (raw) => {
    const url = text(typeof raw === 'object' && raw ? raw.url || raw.rawUrl || raw.maskedUrl : raw)
    if (!/^https?:\/\//.test(url) || urls.includes(url)) return
    if (limit > 0 && urls.length >= limit) return
    urls.push(url)
  }
  // 接车留证唯一真源：pendingImages
  ;(Array.isArray(draft.pendingImages) ? draft.pendingImages : []).forEach(push)
  return urls
}

/** 指纹用全部图身份，不截断；避免第 7 张起改图仍复用旧结论 */
function intakePhotoFingerprintKeys(intake) {
  const draft = (intake && intake.photoDraft) || {}
  const keys = []
  const push = (raw) => {
    const url = text(typeof raw === 'object' && raw ? raw.url || raw.rawUrl || raw.maskedUrl : raw)
    let key = url.split('?')[0].split('#')[0]
    const mark = '/uploads/'
    const at = key.lastIndexOf(mark)
    if (at >= 0) key = key.slice(at + mark.length)
    if (!key || keys.includes(key)) return
    keys.push(key)
  }
  ;(Array.isArray(draft.pendingImages) ? draft.pendingImages : []).forEach(push)
  return keys.sort()
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
        v: 'coverage-v2',
        c: intakeComplaintText(intake),
        p: intakePhotoFingerprintKeys(intake),
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
    'You assist a Chinese auto shop clerk at vehicle intake (pre-repair check-in photos).',
    'Goal: decide whether front / rear / left / right of the car are covered by the photos. Content over form — judge what is actually visible.',
    'Rules:',
    '- Do NOT diagnose damage, severity, or repair order.',
    '- Do NOT rewrite the owner complaint text.',
    '- Count a side as covered if that side of the car body is clearly visible, including 3/4 angle shots. Perfect square-on panorama is NOT required.',
    '- Only mark a side missing when it is clearly absent from all photos. If unsure, mark it covered (true) and omit it from missing.',
    '- coverage and missing MUST agree: every false in coverage appears in missing; never put a side in missing when coverage says true.',
    '- Output natural-language strings in Simplified Chinese. Keys in English.',
    'Return JSON only:',
    '{"coverage":{"front":true,"rear":true,"left":true,"right":true},"missing":["车头"|"车尾"|"左侧"|"右侧"],"tips":[{"title":"","body":""}],"imageNotes":[{"slot":1,"note":""}]}',
  ].join('\n')
  const content = [{ type: 'text', text: instruction }].concat(
    (urls || []).flatMap((url, index) => [
      { type: 'text', text: `Photo slot ${index + 1}` },
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
          {
            role: 'system',
            content:
              'Reply with JSON only. Natural-language string values must be Simplified Chinese.',
          },
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
    const { maskUrlsForModel } = require('./media.service')
    const maskedUrls = urls.length ? await maskUrlsForModel(urls, { albumId }) : []
    const parsed = maskedUrls.length ? await runGenerateLlm(maskedUrls) : null
    await patchIntakeNode(albumId, (item) => {
      const draft = (item.photoDraft && typeof item.photoDraft === 'object' ? item.photoDraft : {}) || {}
      const imageNotes = { ...(draft.imageNotes && typeof draft.imageNotes === 'object' ? draft.imageNotes : {}) }
      const noteRows = Array.isArray(parsed && parsed.imageNotes) ? parsed.imageNotes : []
      noteRows.forEach((row) => {
        const slot = Number(row && row.slot)
        const note = text(row && row.note)
        const url = urls[slot - 1]
        const key = String(url || '')
          .trim()
          .split('?')[0]
          .split('#')[0]
        if (key && note) imageNotes[key] = note.slice(0, 120)
      })
      const next = {
        ...item,
        photoDraft: { ...draft, imageNotes },
        intakeAdvice: !urls.length || parsed
          ? {
              status: 'ready',
              scope: 'coverage',
              fingerprint,
              noPhotos: !urls.length,
              covered: parsed ? parsed.covered : false,
              diagnosis: '',
              photoTips: Array.isArray(parsed && parsed.tips) ? parsed.tips : [],
              askOwner: [],
              checkpoints: [],
              risks: parsed ? parsed.risks : [],
              fixes: parsed ? parsed.fixes : [],
              imageNotes: noteRows,
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
      }
      return next
    })
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
