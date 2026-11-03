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
const { resolveShared } = require('../utils/resolve-shared')
const { contentOfFlowNode } = resolveShared('utils/service-flow-docs.js')

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
  const draft = contentOfFlowNode(intake)
  const payload = (intake && intake.document && intake.document.payload) || {}
  return text(draft.chiefComplaint || payload.chiefComplaint)
}

function albumMileageKm(album) {
  const vehicle = (album && (album.vehicle || album.vehicleJson)) || {}
  return text(vehicle.mileage != null && vehicle.mileage !== '' ? vehicle.mileage : vehicle.mileageKm)
}

function intakePhotoRefs(intake, options = {}) {
  const { usableMaskedProductUrl } = require('../lib/media-storage')
  const draft = contentOfFlowNode(intake)
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 8
  const refs = []
  const push = (raw) => {
    const url = text(typeof raw === 'object' && raw ? raw.url || raw.rawUrl || raw.src : raw)
    if (!/^https?:\/\//.test(url) || refs.some((row) => row.url === url)) return
    if (limit > 0 && refs.length >= limit) return
    const maskedUrl =
      raw && typeof raw === 'object' ? usableMaskedProductUrl(raw.maskedUrl || raw.preMaskedUrl) : ''
    refs.push({ url, maskedUrl })
  }
  // 接车留证唯一真源：pendingImages
  ;(Array.isArray(draft.pendingImages) ? draft.pendingImages : []).forEach(push)
  return refs
}

function intakePhotoUrls(intake, options = {}) {
  return intakePhotoRefs(intake, options).map((row) => row.url)
}

/** 指纹用全部图身份，不截断；避免第 7 张起改图仍复用旧结论 */
function intakePhotoFingerprintKeys(intake) {
  const draft = contentOfFlowNode(intake)
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
  const draft = contentOfFlowNode(intake)
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
    '你是修理厂的接车顾问，只看车身四周拍没拍全。',
    '不要判断损伤，不要改客户诉求。',
    '某一侧车身能看清就算拍到，斜拍也可以，不必正对全景。',
    '看不清、完全没拍到、或只拍了内饰零件的一侧，写一条提醒。标题只用：缺车头、缺车尾、缺左侧、缺右侧。',
    '四周都拍到了，提醒用空数组。其它键留空。',
    '只返回 JSON：',
    '{"故障分析":"","检测顺序":[],"拆分建议":[],"填写建议":[],"简述":"","问答":[],"提醒":[{"类型":"","标题":"缺车尾","正文":"再拍一张能看清车尾的照片。"}],"masks":[{"imageSlot":1,"regions":[{"kind":"plate","left":0,"top":0,"width":0,"height":0}]}]}',
  ].join('\n')
  const content = [{ type: 'text', text: instruction }].concat(
    (urls || []).flatMap((url, index) => [
      { type: 'text', text: `图${index + 1}` },
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
            content: '只返回 JSON。键名和句子都用简体中文。',
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
      try {
        const { queueApplyModelMasks } = require('./model-mask.service')
        queueApplyModelMasks(urls, result && result.text)
      } catch (_) {
        /* 打码失败不影响出意见 */
      }
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
    const refs = intakePhotoRefs(intake)
    const allUrls = refs.map((ref) => ref && ref.url).filter(Boolean)
    const { noteForUrl, notesForAlbumImages } = require('./image-look-cache')
    const known = await notesForAlbumImages(album)
    const visionUrls = allUrls.filter((url) => !noteForUrl(url, known))
    if (allUrls.length && !visionUrls.length) return
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
    const parsed = visionUrls.length ? await runGenerateLlm(visionUrls) : null
    await patchIntakeNode(albumId, (item) => {
      const draft = contentOfFlowNode(item)
      const imageNotes = { ...(draft.imageNotes && typeof draft.imageNotes === 'object' ? draft.imageNotes : {}) }
      const noteRows = Array.isArray(parsed && parsed.imageNotes) ? parsed.imageNotes : []
      noteRows.forEach((row) => {
        const slot = Number(row && row.slot)
        const note = text(row && row.note)
        const url = visionUrls[slot - 1]
        const key = String(url || '')
          .trim()
          .split('?')[0]
          .split('#')[0]
        if (key && note) imageNotes[key] = note.slice(0, 120)
      })
      const next = {
        ...item,
        content: { ...draft, imageNotes },
        intakeAdvice: !visionUrls.length || parsed
          ? {
              status: 'ready',
              scope: 'coverage',
              fingerprint,
              noPhotos: !visionUrls.length,
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
    if (!visionUrls.length || parsed) {
      try {
        const { markAlbumAiAnalysisConsumed } = require('./merchant-plan-quota.service')
        await markAlbumAiAnalysisConsumed(albumId)
      } catch (_) {
        /* ignore */
      }
    }
  } catch (err) {
    await patchIntakeNode(albumId, (item) => ({
      ...item,
      intakeAdvice: {
        ...(item.intakeAdvice || {}),
        status: 'failed',
        errorMessage: '未能出意见',
        updatedAt: new Date().toISOString(),
      },
    })).catch(() => {})
    throw err
  } finally {
    jobsInFlight.delete(key)
  }
}

async function queueIntakeAdviceIfNeeded(album, merchantId, options = {}) {
  const force = Boolean(options && options.force)
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
  const hasReady = current.status === 'ready' && intakeAdviceHasContent(current)
  // 有上次结果默认复用；仅 force 才重跑
  if (hasReady && !force) {
    return {
      queued: false,
      reuse: true,
      stale: text(current.fingerprint) !== fingerprint,
    }
  }
  {
    const { assertAiAnalysisQuotaAvailable } = require('./merchant-plan-quota.service')
    await assertAiAnalysisQuotaAvailable(merchantId || album.merchantId, album.id)
  }
  await patchIntakeNode(album.id, (item) => {
    const prev = (item && item.intakeAdvice) || {}
    return {
      ...item,
      intakeAdvice: {
        ...prev,
        status: 'queued',
        fingerprint,
        updatedAt: new Date().toISOString(),
      },
    }
  })
  setImmediate(() => {
    runIntakeAdviceJob(album.id).catch(() => {})
  })
  return { queued: true, stale: false }
}

module.exports = {
  queueIntakeAdviceIfNeeded,
  sanitizeIntakeAdviceForView,
  runIntakeAdviceJob,
  buildFingerprint,
}
