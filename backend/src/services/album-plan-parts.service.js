const { prisma } = require('../lib/prisma')
const { newId, toIso } = require('../lib/ids')
const { resolveClientReadableMediaUrl } = require('../lib/media-storage')
const { resolvePlanAmount } = require('../utils/album-price')
const {
  sanitizePlanPartsDraft,
  buildPlanAmountMismatchHint,
} = require('../lib/plan-quote-parse')
const { parsePlanQuoteImageWithFallback } = require('./plan-quote-parse.service')
const { config } = require('../config')
const {
  extractPartCodeCandidates,
  mergeCandidateLists,
} = require('../lib/part-code-candidates')
const { assertMerchantAlbum } = require('../lib/merchant-album-access')

const STAGE_PLAN = 'stage_3'

async function loadAlbumPlanRow(albumId, storeId, merchantId) {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    include: {
      images: { where: { nodeId: STAGE_PLAN }, orderBy: { idx: 'asc' } },
    },
  })
  assertMerchantAlbum(album, storeId, merchantId)
  return album
}

function mapPlanPartsJson(raw) {
  return sanitizePlanPartsDraft(Array.isArray(raw) ? raw : [])
}

function resolvePlanQuoteThumbs(images = []) {
  return (images || [])
    .filter((row) => row.nodeId === STAGE_PLAN)
    .sort((a, b) => a.idx - b.idx)
    .map((row) => resolveClientReadableMediaUrl(row.rawUrl))
    .filter(Boolean)
}

function planPartsDraftToAlbumParts(planParts = [], existingParts = []) {
  const existingByPlan = new Map()
  ;(existingParts || []).forEach((part) => {
    const key = String(part.planPartId || part.linkKey || '').trim()
    if (key) existingByPlan.set(key, part)
  })

  const fromPlan = (planParts || []).map((plan) => {
    const existing = existingByPlan.get(plan.planPartId)
    return {
      partId: existing?.partId || existing?.id || `part_${plan.planPartId}`,
      planPartId: plan.planPartId,
      linkKey: plan.planPartId,
      partName: plan.name,
      partType: existing?.partType || plan.partType,
      partBrand: existing?.partBrand || plan.partBrand || '',
      partCode: existing?.partCode || plan.partCode || '',
      photos: Array.isArray(existing?.photos) ? existing.photos : [],
      source: 'plan_linked',
      qty: plan.qty || 1,
    }
  })

  const extras = (existingParts || []).filter(
    (part) =>
      part.source === 'extra' ||
      (!part.planPartId && !part.linkKey),
  )
  return [...fromPlan, ...extras]
}

function buildPlanPartsContext(album) {
  const planParts = mapPlanPartsJson(album.planPartsJson)
  const planAmount = resolvePlanAmount(album)
  const amountCheck = buildPlanAmountMismatchHint(planAmount, planParts)
  return {
    planParts,
    planPartsLocked: Boolean(album.planPartsLockedAt),
    planPartsLockedAt: album.planPartsLockedAt ? toIso(album.planPartsLockedAt) : '',
    planQuoteThumbs: resolvePlanQuoteThumbs(album.images),
    planQuoteImageIds: Array.isArray(album.planQuoteImageIds) ? album.planQuoteImageIds : [],
    planAmount,
    amountMismatch: amountCheck.mismatch,
    amountMismatchHint: amountCheck.hint,
  }
}

async function syncPlanQuoteImageIds(albumId) {
  const images = await prisma.albumImage.findMany({
    where: { albumId, nodeId: STAGE_PLAN },
    orderBy: { idx: 'asc' },
  })
  await prisma.album.update({
    where: { id: albumId },
    data: { planQuoteImageIds: images.map((row) => row.id) },
  })
  return images.map((row) => row.id)
}

async function getMerchantPlanPartsContext(albumId, storeId, merchantId) {
  const album = await loadAlbumPlanRow(albumId, storeId, merchantId)
  return buildPlanPartsContext(album)
}

async function saveMerchantPlanPartsDraft(albumId, storeId, merchantId, payload = {}) {
  const album = await loadAlbumPlanRow(albumId, storeId, merchantId)
  const planParts = sanitizePlanPartsDraft(payload.planParts)
  await prisma.album.update({
    where: { id: albumId },
    data: { planPartsJson: planParts },
  })
  const updated = await loadAlbumPlanRow(albumId, storeId, merchantId)
  return buildPlanPartsContext(updated)
}

async function lockMerchantPlanParts(albumId, storeId, merchantId) {
  const album = await loadAlbumPlanRow(albumId, storeId, merchantId)
  const draft = mapPlanPartsJson(album.planPartsJson)
  if (!draft.length) {
    const err = new Error('请先维护方案配件目录')
    err.status = 400
    throw err
  }
  const invalid = draft.find((row) => !row.name || !row.partType)
  if (invalid) {
    const err = new Error('每项配件须填写名称与标准类型')
    err.status = 400
    throw err
  }
  const confirmed = draft.map((row) => ({ ...row, status: 'confirmed' }))
  await prisma.album.update({
    where: { id: albumId },
    data: {
      planPartsJson: confirmed,
      planPartsLockedAt: new Date(),
    },
  })
  const updated = await loadAlbumPlanRow(albumId, storeId, merchantId)
  return buildPlanPartsContext(updated)
}

async function unlockMerchantPlanParts(albumId, storeId, merchantId) {
  const album = await loadAlbumPlanRow(albumId, storeId, merchantId)
  if (!album.planPartsLockedAt) {
    const err = new Error('方案配件目录尚未锁定')
    err.status = 400
    throw err
  }
  const draft = mapPlanPartsJson(album.planPartsJson).map((row) => ({
    ...row,
    status: 'draft',
  }))
  await prisma.album.update({
    where: { id: albumId },
    data: {
      planPartsJson: draft,
      planPartsLockedAt: null,
    },
  })
  const updated = await loadAlbumPlanRow(albumId, storeId, merchantId)
  return buildPlanPartsContext(updated)
}

async function runMerchantPlanQuoteOcr(albumId, storeId, merchantId, payload = {}) {
  const album = await loadAlbumPlanRow(albumId, storeId, merchantId)
  const documentType = String(payload.documentType || 'repair_quote').trim() || 'repair_quote'
  const imageUrl = String(payload.imageUrl || '').trim()
  const thumbs = resolvePlanQuoteThumbs(album.images)
  const targetUrl = imageUrl || thumbs[0] || ''
  if (!targetUrl) {
    const err = new Error(
      documentType === 'settlement'
        ? '请先上传结算单图片'
        : documentType === 'loss_assessment'
          ? '请先上传定损单图片'
          : '请先在维修方案节点上传报价单图片',
    )
    err.status = 400
    throw err
  }

  if (documentType === 'loss_assessment' || documentType === 'settlement') {
    return runDocumentSummaryOcr(album, albumId, documentType, targetUrl)
  }

  const result = await parsePlanQuoteImageWithFallback(targetUrl)

  const planParts = sanitizePlanPartsDraft(result.planPartsDraft).map((row) => ({
    ...row,
    status: 'confirmed',
  }))
  if (!planParts.length) {
    const err = new Error('未识别到可登记的零配件，请手工添加')
    err.status = 422
    throw err
  }

  const existingParts = Array.isArray(album.partsJson) ? album.partsJson : []
  const parts = planPartsDraftToAlbumParts(planParts, existingParts)

  await prisma.album.update({
    where: { id: albumId },
    data: {
      planPartsJson: planParts,
      partsJson: parts,
    },
  })
  const updated = await loadAlbumPlanRow(albumId, storeId, merchantId)
  return {
    ...buildPlanPartsContext(updated),
    documentType: 'repair_quote',
    parts,
    ocrProvider: result.provider,
    parseMethod: result.parseMethod || '',
    parseHint: result.parseHint || '',
    parseSummary: result.parseSummary || '',
    llmEngine: result.llmEngine || '',
    llmEngineLabel: result.llmEngineLabel || '',
    llmFailures: result.llmFailures || [],
    textPreview: result.textPreview || '',
  }
}

function extractMoneyCandidates(text) {
  const raw = String(text || '')
  const matches = [...raw.matchAll(/(?:¥|￥|RMB|元)?\s*(\d{2,7}(?:\.\d{1,2})?)\s*元?/gi)]
  const values = matches
    .map((m) => Math.round(Number(m[1])))
    .filter((n) => Number.isFinite(n) && n >= 50 && n <= 500000)
  const unique = [...new Set(values)]
  unique.sort((a, b) => b - a)
  return unique.slice(0, 5)
}

async function runDocumentSummaryOcr(album, albumId, documentType, targetUrl) {
  const { recognizeGeneralText } = require('./plan-quote-ocr.service')
  let text = ''
  try {
    text = await recognizeGeneralText(targetUrl)
  } catch (err) {
    if (config.nodeEnv !== 'production') {
      text =
        documentType === 'settlement'
          ? '结算合计 3280 元\n机油工时 200\n配件 3080'
          : '定损合计 5600 元\n前保险杠 1200\n左前门 1800'
    } else {
      throw err
    }
  }

  const amounts = extractMoneyCandidates(text)
  const label = documentType === 'settlement' ? '结算单' : '定损单'
  const stageId = documentType === 'settlement' ? 'stage_6' : 'stage_3'
  const amountHint = amounts.length ? `识别到金额候选：${amounts.map((n) => `¥${n}`).join('、')}` : '未稳定识别到金额，请手工填写'
  const summaryLine = `【${label} OCR 摘要】${amountHint}`
  const preview = String(text || '').trim().slice(0, 2000)

  const node = await prisma.albumNode.findUnique({
    where: { albumId_nodeId: { albumId, nodeId: stageId } },
  })
  if (node) {
    const existingNote = String(node.note || '').trim()
    const nextNote = existingNote.includes('【' + label + ' OCR 摘要】')
      ? existingNote
      : [existingNote, summaryLine].filter(Boolean).join('\n')
    await prisma.albumNode.update({
      where: { albumId_nodeId: { albumId, nodeId: stageId } },
      data: { note: nextNote, updatedAt: new Date() },
    })
  }

  if (documentType === 'settlement' && amounts[0] != null) {
    await prisma.album.update({
      where: { id: albumId },
      data: {
        maxAmount: amounts[0],
        minAmount: album.minAmount != null ? album.minAmount : amounts[0],
      },
    })
  }

  const updated = await loadAlbumPlanRow(albumId, album.storeId, album.merchantId)
  return {
    ...buildPlanPartsContext(updated),
    documentType,
    textPreview: preview,
    amountCandidates: amounts,
    parseHint: `${label}已识别文字摘要，请核对节点说明中的 OCR 摘要；金额需人工确认。`,
    parseMethod: 'aliyun-ocr-general',
    ocrProvider: 'ocr-api-general',
    parts: Array.isArray(updated.partsJson) ? updated.partsJson : [],
    planParts: Array.isArray(updated.planPartsJson) ? updated.planPartsJson : [],
  }
}

async function recognizePartLabelOcr(input) {
  let imageUrls = []
  if (Array.isArray(input)) {
    imageUrls = input
  } else if (input && Array.isArray(input.imageUrls)) {
    imageUrls = input.imageUrls
  } else if (input && input.imageUrl) {
    imageUrls = [input.imageUrl]
  } else if (typeof input === 'string') {
    imageUrls = [input]
  }

  imageUrls = imageUrls.map((url) => String(url || '').trim()).filter(Boolean)
  if (!imageUrls.length) {
    const err = new Error('请先上传配件凭证图')
    err.status = 400
    throw err
  }

  try {
    const { recognizeGeneralText } = require('./plan-quote-ocr.service')
    const perImage = []
    const failures = []

    for (let imageIndex = 0; imageIndex < imageUrls.length; imageIndex += 1) {
      const imageUrl = imageUrls[imageIndex]
      try {
        const text = await recognizeGeneralText(imageUrl)
        perImage.push(extractPartCodeCandidates(text, imageIndex))
      } catch (err) {
        failures.push({
          imageIndex,
          message: err.message || '识别失败',
        })
      }
    }

    const candidates = mergeCandidateLists(perImage).map((item) => ({
      ...item,
      imageUrl: imageUrls[item.imageIndex] || imageUrls[0],
    }))

    return {
      candidates,
      partCode: candidates[0]?.partCode || '',
      partBrand: candidates[0]?.partBrand || '',
      imageCount: imageUrls.length,
      failures,
      provider: 'ocr-api-general',
    }
  } catch (e) {
    if (config.nodeEnv !== 'production') {
      const candidates = imageUrls.flatMap((url, imageIndex) => [
        {
          partCode: `MOCK-CODE-${imageIndex + 1}A`,
          partBrand: imageIndex === 0 ? '演示品牌' : '',
          imageIndex,
          imageUrl: url,
          snippet: `MOCK-CODE-${imageIndex + 1}A`,
        },
        {
          partCode: `MOCK-CODE-${imageIndex + 1}B`,
          partBrand: '',
          imageIndex,
          imageUrl: url,
          snippet: `MOCK-CODE-${imageIndex + 1}B`,
        },
      ])
      const merged = mergeCandidateLists([candidates])
      return {
        candidates: merged.map((item) => ({
          ...item,
          imageUrl: imageUrls[item.imageIndex] || imageUrls[0],
        })),
        partCode: merged[0]?.partCode || '',
        partBrand: merged[0]?.partBrand || '',
        imageCount: imageUrls.length,
        failures: [],
        provider: 'mock',
      }
    }
    throw e
  }
}

module.exports = {
  getMerchantPlanPartsContext,
  saveMerchantPlanPartsDraft,
  lockMerchantPlanParts,
  unlockMerchantPlanParts,
  runMerchantPlanQuoteOcr,
  recognizePartLabelOcr,
  syncPlanQuoteImageIds,
  buildPlanPartsContext,
  planPartsDraftToAlbumParts,
}
