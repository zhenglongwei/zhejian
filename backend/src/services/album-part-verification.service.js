const { prisma } = require('../lib/prisma')
const { newId, toIso } = require('../lib/ids')
const { assertPersistentImageUrl } = require('../lib/media-storage')
const {
  PART_VERIFY_STATUS,
  VALID_PART_VERIFY_STATUSES,
  MAX_PART_VERIFY_NOTE,
  MAX_PART_VERIFY_IMAGES,
  PART_VERIFY_CONSENT_TEXT,
  PART_VERIFY_ONSITE_REMINDER,
} = require('../constants/album-review')
const { getUserServiceAlbum } = require('./service-album.service')
const {
  normalizePlanParts,
  normalizeAlbumParts,
  buildPartVerifyPairs,
  hasStructuredPlanParts,
} = require('../../../utils/album-part-pairs')

function summarizeVerifications(parts, verificationMap) {
  let matched = 0
  let question = 0
  let skipped = 0
  let pending = 0
  parts.forEach((part) => {
    const row = verificationMap.get(part.partKey)
    if (!row || row.status === PART_VERIFY_STATUS.SKIPPED) {
      if (!row) pending += 1
      else skipped += 1
      return
    }
    if (row.status === PART_VERIFY_STATUS.MATCHED) matched += 1
    else if (row.status === PART_VERIFY_STATUS.QUESTION) question += 1
    else skipped += 1
  })
  return {
    total: parts.length,
    matched,
    question,
    skipped,
    pending,
    hasQuestion: question > 0,
    label: buildSummaryLabel({ total: parts.length, matched, question, pending }),
  }
}

function buildSummaryLabel({ total, matched, question, pending }) {
  if (!total) return ''
  const parts = []
  if (matched > 0) parts.push(`已验真 ${matched} 项`)
  if (question > 0) parts.push(`${question} 项有疑问`)
  if (pending > 0) parts.push(`${pending} 项待验真`)
  return parts.join(' · ') || ''
}

function extractPlanSummary(albumView = {}) {
  const rows = Array.isArray(albumView.summaryRows) ? albumView.summaryRows : []
  const planRow = rows.find((row) => row && row.label === '维修方案')
  if (planRow && planRow.value && planRow.value !== '—') {
    return String(planRow.value).trim()
  }
  const nodes = Array.isArray(albumView.nodes) ? albumView.nodes : []
  const stage3 = nodes.find(
    (node) => node && (node.id === 'stage_3' || node.nodeId === 'stage_3'),
  )
  if (stage3 && stage3.note) {
    return String(stage3.note).trim()
  }
  const planAmount = albumView.planAmount
  if (planAmount != null && planAmount !== '' && Number.isFinite(Number(planAmount))) {
    return `方案参考报价 ¥${Math.round(Number(planAmount))}（配件明细见门店方案说明或报价表）`
  }
  return ''
}

function mapVerificationRow(row) {
  if (!row) return null
  return {
    id: row.id,
    partKey: row.partKey,
    partName: row.partName,
    partType: row.partType,
    status: row.status,
    note: row.note || '',
    images: Array.isArray(row.imagesJson) ? row.imagesJson : [],
    updatedAt: toIso(row.updatedAt),
  }
}

function attachVerification(entry, verificationMap) {
  const verification = mapVerificationRow(verificationMap.get(entry.partKey))
  return { ...entry, verification }
}

function collectVerifyTargets(pairs, extras, albumParts) {
  if (pairs.length || extras.length) {
    return [...pairs, ...extras].map((entry) => ({
      partKey: entry.partKey,
      name: entry.albumPart?.name || entry.planPart?.name || '',
      partType: entry.albumPart?.partType || entry.planPart?.partType || '',
    }))
  }
  return albumParts
}

function resolvePlanQuoteThumbs(planQuoteImageIds, images = []) {
  const ids = Array.isArray(planQuoteImageIds) ? planQuoteImageIds : []
  const imageRows = Array.isArray(images) ? images : []
  if (ids.length) {
    return ids
      .map((id) => {
        const hit = imageRows.find((row) => row.id === id)
        return hit?.rawUrl || String(id || '').trim()
      })
      .filter(Boolean)
  }
  return imageRows
    .filter((row) => row.nodeId === 'stage_3')
    .sort((a, b) => a.idx - b.idx)
    .map((row) => row.rawUrl)
    .filter(Boolean)
}

async function loadAlbumPartsContext(albumId, userId) {
  const album = await getUserServiceAlbum(albumId, userId)
  const row = await prisma.album.findUnique({
    where: { id: albumId },
    select: {
      merchantId: true,
      storeId: true,
      partsJson: true,
      planPartsJson: true,
      planQuoteImageIds: true,
      planPartsLockedAt: true,
      images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
    },
  })

  const albumParts = normalizeAlbumParts(row?.partsJson)
  const planParts = normalizePlanParts(row?.planPartsJson)
  const structuredPlanParts = hasStructuredPlanParts(
    row?.planPartsJson,
    row?.planPartsLockedAt,
  )
  const { pairs: rawPairs, extras: rawExtras } = structuredPlanParts
    ? buildPartVerifyPairs(planParts, albumParts)
    : { pairs: [], extras: [] }

  const verifications = await prisma.serviceAlbumPartVerification.findMany({
    where: { albumId, userId },
  })
  const verificationMap = new Map(verifications.map((v) => [v.partKey, v]))

  const pairs = rawPairs.map((entry) => attachVerification(entry, verificationMap))
  const extras = rawExtras.map((entry) => attachVerification(entry, verificationMap))
  const verifyTargets = collectVerifyTargets(pairs, extras, albumParts)
  const items = albumParts.map((part) => ({
    ...part,
    verification: mapVerificationRow(verificationMap.get(part.partKey)),
  }))
  const planSummary = extractPlanSummary(album)
  const planQuoteThumbs = resolvePlanQuoteThumbs(row?.planQuoteImageIds, row?.images)

  return {
    albumId,
    albumTitle: album.serviceName || '我的服务相册',
    storeName: album.store?.name || '',
    storePhone: album.store?.phone || '',
    parts: items,
    pairs,
    extras,
    summary: summarizeVerifications(verifyTargets, verificationMap),
    consentText: PART_VERIFY_CONSENT_TEXT,
    onsiteReminder: PART_VERIFY_ONSITE_REMINDER,
    planSummary,
    planQuoteThumbs,
    hasStructuredPlanParts: structuredPlanParts,
    hasParts: albumParts.length > 0 || planParts.length > 0,
  }
}

function sanitizeImages(images) {
  if (!Array.isArray(images)) return []
  return images.slice(0, MAX_PART_VERIFY_IMAGES).map((url) => assertPersistentImageUrl(url)).filter(Boolean)
}

async function saveAlbumPartVerifications(albumId, userId, payload = {}) {
  if (!payload.consent) {
    const err = new Error('请先阅读并勾选验真声明')
    err.status = 400
    throw err
  }

  const items = Array.isArray(payload.items) ? payload.items : []
  if (!items.length) {
    const err = new Error('请至少验真一项配件')
    err.status = 400
    throw err
  }

  const album = await getUserServiceAlbum(albumId, userId)
  const row = await prisma.album.findUnique({
    where: { id: albumId },
    select: { merchantId: true, storeId: true, partsJson: true },
  })
  const parts = normalizeAlbumParts(row?.partsJson)
  const partMap = new Map(parts.map((p) => [p.partKey, p]))
  const storeId = row?.storeId || album.store?.id || ''
  const merchantId = row?.merchantId || ''

  for (const item of items) {
    const partKey = String(item.partKey || '').trim()
    const status = String(item.status || '').trim()
    if (!partKey) continue
    if (!VALID_PART_VERIFY_STATUSES.has(status)) {
      const err = new Error('请选择验真结果')
      err.status = 400
      throw err
    }
    const part = partMap.get(partKey)
    const note = String(item.note || '').trim()
    if (note.length > MAX_PART_VERIFY_NOTE) {
      const err = new Error(`说明不超过 ${MAX_PART_VERIFY_NOTE} 字`)
      err.status = 400
      throw err
    }
    const data = {
      partName: item.partName || part?.name || '',
      partType: item.partType || part?.partType || '',
      status,
      note,
      imagesJson: sanitizeImages(item.images),
      storeId,
      merchantId,
    }
    await prisma.serviceAlbumPartVerification.upsert({
      where: {
        albumId_userId_partKey: { albumId, userId, partKey },
      },
      create: {
        id: newId('apv'),
        albumId,
        userId,
        partKey,
        ...data,
      },
      update: data,
    })
  }

  return loadAlbumPartsContext(albumId, userId)
}

async function getPartVerifySummariesForUser(userId, albumIds = []) {
  const ids = [...new Set((albumIds || []).filter(Boolean))]
  if (!ids.length) return {}

  const albums = await prisma.album.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      partsJson: true,
      planPartsJson: true,
      planPartsLockedAt: true,
    },
  })
  const verifications = await prisma.serviceAlbumPartVerification.findMany({
    where: { userId, albumId: { in: ids } },
  })
  const byAlbum = new Map()
  verifications.forEach((row) => {
    if (!byAlbum.has(row.albumId)) byAlbum.set(row.albumId, [])
    byAlbum.get(row.albumId).push(row)
  })

  const result = {}
  albums.forEach((album) => {
    const albumParts = normalizeAlbumParts(album.partsJson)
    const planParts = normalizePlanParts(album.planPartsJson)
    const structured = hasStructuredPlanParts(album.planPartsJson, album.planPartsLockedAt)
    const { pairs, extras } = structured
      ? buildPartVerifyPairs(planParts, albumParts)
      : { pairs: [], extras: [] }
    const verifyTargets = collectVerifyTargets(pairs, extras, albumParts)
    if (!verifyTargets.length) return
    const verificationMap = new Map(
      (byAlbum.get(album.id) || []).map((row) => [row.partKey, row]),
    )
    result[album.id] = {
      partCount: verifyTargets.length,
      ...summarizeVerifications(verifyTargets, verificationMap),
    }
  })
  return result
}

async function listMerchantPartVerifications(storeId, tab = 'question') {
  const where = { storeId }
  if (tab === 'question') {
    where.status = PART_VERIFY_STATUS.QUESTION
  }
  const rows = await prisma.serviceAlbumPartVerification.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })
  if (!rows.length) return []

  const albumIds = [...new Set(rows.map((r) => r.albumId))]
  const albums = await prisma.album.findMany({
    where: { id: { in: albumIds } },
    select: { id: true, serviceName: true, userPhone: true },
  })
  const albumMap = new Map(albums.map((a) => [a.id, a]))

  return rows.map((row) => {
    const album = albumMap.get(row.albumId)
    const phone = album?.userPhone || ''
    const phoneTail = phone.length >= 4 ? phone.slice(-4) : ''
    return {
      id: row.id,
      albumId: row.albumId,
      serviceName: album?.serviceName || '服务相册',
      partName: row.partName,
      partType: row.partType,
      status: row.status,
      notePreview: (row.note || '').slice(0, 60),
      ownerHint: phoneTail ? `车主*${phoneTail}` : '车主',
      updatedAt: toIso(row.updatedAt),
    }
  })
}

async function fetchMerchantPartVerifyStats(storeId) {
  const pendingQuestion = await prisma.serviceAlbumPartVerification.count({
    where: { storeId, status: PART_VERIFY_STATUS.QUESTION },
  })
  return { pendingQuestion }
}

module.exports = {
  loadAlbumPartsContext,
  saveAlbumPartVerifications,
  getPartVerifySummariesForUser,
  listMerchantPartVerifications,
  fetchMerchantPartVerifyStats,
  normalizeAlbumParts,
  summarizeVerifications,
}
