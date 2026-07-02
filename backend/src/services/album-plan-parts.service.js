const { prisma } = require('../lib/prisma')
const { newId, toIso } = require('../lib/ids')
const { rewriteMediaUrlForCurrentBase } = require('../lib/media-storage')
const { resolvePlanAmount } = require('../utils/album-price')
const {
  sanitizePlanPartsDraft,
  buildPlanAmountMismatchHint,
} = require('../lib/plan-quote-parse')
const { parsePlanQuoteImageWithFallback } = require('./plan-quote-parse.service')
const { config } = require('../config')

const STAGE_PLAN = 'stage_3'

function assertMerchantAlbumRow(album, storeId, merchantId) {
  if (!album) {
    const err = new Error('档案不存在或已被删除')
    err.status = 404
    throw err
  }
  if (merchantId && album.merchantId === merchantId) return
  if (storeId && album.storeId === storeId) return
  const err = new Error('档案不存在或已被删除')
  err.status = 404
  throw err
}

async function loadAlbumPlanRow(albumId, storeId, merchantId) {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    include: {
      images: { where: { nodeId: STAGE_PLAN }, orderBy: { idx: 'asc' } },
    },
  })
  assertMerchantAlbumRow(album, storeId, merchantId)
  return album
}

function mapPlanPartsJson(raw) {
  return sanitizePlanPartsDraft(Array.isArray(raw) ? raw : [])
}

function resolvePlanQuoteThumbs(images = []) {
  return (images || [])
    .filter((row) => row.nodeId === STAGE_PLAN)
    .sort((a, b) => a.idx - b.idx)
    .map((row) => rewriteMediaUrlForCurrentBase(row.rawUrl))
    .filter(Boolean)
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
  if (album.planPartsLockedAt) {
    const err = new Error('方案配件目录已锁定，请先解锁后再修改')
    err.status = 409
    throw err
  }
  const planParts = sanitizePlanPartsDraft(payload.planParts)
  if (!planParts.length) {
    const err = new Error('请至少添加一项方案配件')
    err.status = 400
    throw err
  }
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
  if (album.planPartsLockedAt) {
    const err = new Error('方案配件目录已锁定，请先解锁后再识别')
    err.status = 409
    throw err
  }
  const imageUrl = String(payload.imageUrl || '').trim()
  const thumbs = resolvePlanQuoteThumbs(album.images)
  const targetUrl = imageUrl || thumbs[0] || ''
  if (!targetUrl) {
    const err = new Error('请先在阶段三上传报价表图片')
    err.status = 400
    throw err
  }

  const result = await parsePlanQuoteImageWithFallback(targetUrl)

  const planParts = sanitizePlanPartsDraft(result.planPartsDraft)
  await prisma.album.update({
    where: { id: albumId },
    data: { planPartsJson: planParts },
  })
  const updated = await loadAlbumPlanRow(albumId, storeId, merchantId)
  return {
    ...buildPlanPartsContext(updated),
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

async function recognizePartLabelOcr(imageUrl) {
  const url = String(imageUrl || '').trim()
  if (!url) {
    const err = new Error('请先上传配件凭证图')
    err.status = 400
    throw err
  }
  try {
    const { recognizeGeneralText } = require('./plan-quote-ocr.service')
    const text = await recognizeGeneralText(url)
    const codeMatch =
      text.match(/(?:编码|零件号|PN)[:：]?\s*([A-Z0-9-]{4,})/i) ||
      text.match(/\b([A-Z0-9]{2,}[-/][A-Z0-9-]{3,})\b/)
    const brandMatch = text.match(/(?:品牌|BRAND)[:：]?\s*([\u4e00-\u9fa5A-Za-z0-9]{2,12})/i)
    return {
      partCode: codeMatch ? codeMatch[1].trim() : '',
      partBrand: brandMatch ? brandMatch[1].trim() : '',
      textPreview: String(text || '').slice(0, 120),
      provider: 'ocr-api-general',
    }
  } catch (e) {
    if (config.nodeEnv !== 'production') {
      return {
        partCode: 'MOCK-CODE-001',
        partBrand: '',
        textPreview: '',
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
}
