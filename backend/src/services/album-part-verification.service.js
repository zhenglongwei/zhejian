const { prisma } = require('../lib/prisma')
const { newId, toIso } = require('../lib/ids')
const { assertPersistentImageUrl } = require('../lib/media-storage')
const {
  PART_VERIFY_STATUS,
  VALID_PART_VERIFY_STATUSES,
  MAX_PART_VERIFY_NOTE,
  MAX_PART_VERIFY_IMAGES,
  PART_VERIFY_CONSENT_TEXT,
} = require('../constants/album-review')
const { getUserServiceAlbum } = require('./service-album.service')

function normalizeParts(partsJson) {
  const list = Array.isArray(partsJson) ? partsJson : []
  return list.map((part, index) => ({
    partKey: String(part.partId || part.id || index),
    name: part.name || part.partName || `配件 ${index + 1}`,
    partType: part.partType || part.type || '',
    qty: part.qty || part.quantity || 1,
    thumbUrl: part.thumbUrl || part.imageUrl || '',
  }))
}

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
  if (matched > 0) parts.push(`已核对 ${matched} 项`)
  if (question > 0) parts.push(`${question} 项有疑问`)
  if (pending > 0) parts.push(`${pending} 项待核对`)
  return parts.join(' · ') || ''
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

async function loadAlbumPartsContext(albumId, userId) {
  const album = await getUserServiceAlbum(albumId, userId)
  const row = await prisma.album.findUnique({
    where: { id: albumId },
    select: { merchantId: true, storeId: true, partsJson: true },
  })
  const parts = normalizeParts(row?.partsJson)
  const verifications = await prisma.serviceAlbumPartVerification.findMany({
    where: { albumId, userId },
  })
  const verificationMap = new Map(verifications.map((v) => [v.partKey, v]))
  const items = parts.map((part) => ({
    ...part,
    verification: mapVerificationRow(verificationMap.get(part.partKey)),
  }))
  return {
    albumId,
    albumTitle: album.serviceName || '我的服务相册',
    storeName: album.store?.name || '',
    parts: items,
    summary: summarizeVerifications(parts, verificationMap),
    consentText: PART_VERIFY_CONSENT_TEXT,
    hasParts: parts.length > 0,
  }
}

function sanitizeImages(images) {
  if (!Array.isArray(images)) return []
  return images.slice(0, MAX_PART_VERIFY_IMAGES).map((url) => assertPersistentImageUrl(url)).filter(Boolean)
}

async function saveAlbumPartVerifications(albumId, userId, payload = {}) {
  if (!payload.consent) {
    const err = new Error('请先阅读并勾选核对声明')
    err.status = 400
    throw err
  }

  const items = Array.isArray(payload.items) ? payload.items : []
  if (!items.length) {
    const err = new Error('请至少核对一项配件')
    err.status = 400
    throw err
  }

  const album = await getUserServiceAlbum(albumId, userId)
  const row = await prisma.album.findUnique({
    where: { id: albumId },
    select: { merchantId: true, storeId: true, partsJson: true },
  })
  const parts = normalizeParts(row?.partsJson)
  const partMap = new Map(parts.map((p) => [p.partKey, p]))
  const storeId = row?.storeId || album.store?.id || ''
  const merchantId = row?.merchantId || ''

  for (const item of items) {
    const partKey = String(item.partKey || '').trim()
    const status = String(item.status || '').trim()
    if (!partKey) continue
    if (!VALID_PART_VERIFY_STATUSES.has(status)) {
      const err = new Error('请选择核对结果')
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
    select: { id: true, partsJson: true },
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
    const parts = normalizeParts(album.partsJson)
    if (!parts.length) return
    const verificationMap = new Map(
      (byAlbum.get(album.id) || []).map((row) => [row.partKey, row]),
    )
    result[album.id] = {
      partCount: parts.length,
      ...summarizeVerifications(parts, verificationMap),
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
  normalizeParts,
  summarizeVerifications,
}
