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
  const vehicle = (album && album.vehicleJson) || {}
  return {
    vehicleBrand: text(draft.vehicleBrand) || text(vehicle.brand),
    vehicleSeries: text(draft.vehicleSeries) || text(vehicle.series),
    vehicleYear: text(draft.vehicleYear) || text(vehicle.modelYear) || text(vehicle.year),
  }
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
        c: text(draft.chiefComplaint),
        t: text(album && album.templateId),
        b: vehicle.vehicleBrand,
        s: vehicle.vehicleSeries,
        y: vehicle.vehicleYear,
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
    '你是汽修店员的接车助手。根据主诉和车型给短意见，不要百科，不要编没听到的损伤。',
    '四块不许互相复述。',
    'askOwner：最多 4 条。每条一个短标题，options 2到4个可勾选项（短词，如「冷车启动」「过减速带」）。没有把握就不问。',
    'diagnosis：最多三句，只说最可能什么问题。不要列部位清单，不要写怎么拍。',
    'photoTips：只写进场环车留证（四角/故障方位外观、仪表、未举升能拍的底盘外观）。不要写举升、拆检、球头间隙、衬套。最多 5 条，title 部位，body 一句怎么拍。',
    'checkpoints：举升后检测顺序，按优先级从前到后。每条 partName + 一句 why（为什么先查）。不要写怎么拍，不要重复 diagnosis。最多 8 条。',
    '车型年款按本车写。不要写模型名、不要写 AI。',
    `本单：${JSON.stringify(facts)}`,
    '输出 JSON：{"askOwner":[{"title","options":["",""]}],"diagnosis":"","photoTips":[{"title","body"}],"checkpoints":[{"partName","why","priority":1}]}',
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
      chiefComplaint: text(draft.chiefComplaint),
      templateId: text(album.templateId),
      serviceName: text(album.serviceName),
      vehicleBrand: vehicle.vehicleBrand,
      vehicleSeries: vehicle.vehicleSeries,
      vehicleYear: vehicle.vehicleYear,
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
