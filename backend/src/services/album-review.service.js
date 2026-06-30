const { prisma } = require('../lib/prisma')
const { newId, toIso } = require('../lib/ids')
const { assertPersistentImageUrl } = require('../lib/media-storage')
const {
  REPAIR_REVIEW_KEYS,
  ALBUM_REVIEW_KEYS,
  REVIEW_DIMENSION_KEYS,
  ALBUM_REVIEW_STATUS,
  MAX_REVIEW_CONTENT,
  MAX_REVIEW_TAGS,
  MAX_REVIEW_IMAGES,
  MAX_MERCHANT_REPLY,
  ALBUM_REVIEW_CONSENT_TEXT,
  ALBUM_REVIEW_PUBLIC_CONSENT_TEXT,
} = require('../constants/album-review')
const { getUserServiceAlbum } = require('./service-album.service')
const {
  REVIEW_IMAGE_MASK_STATUS,
  parseRawReviewImages,
  maskReviewImagesForRow,
  ensureReviewImagesMasked,
  getPublicReviewImages,
} = require('./album-review-image.service')

const COMPLETED_ALBUM_STATUSES = new Set(['completed'])

function avgKeys(scores, keys) {
  const values = keys.map((key) => Number(scores[key]) || 0).filter((v) => v > 0)
  if (!values.length) return 0
  const sum = values.reduce((a, b) => a + b, 0)
  return Math.round((sum / values.length) * 10) / 10
}

function calcRepairScore(scores = {}) {
  return avgKeys(scores, REPAIR_REVIEW_KEYS)
}

function calcAlbumScore(scores = {}) {
  return avgKeys(scores, ALBUM_REVIEW_KEYS)
}

function calcOverallScore(scores = {}) {
  const repair = calcRepairScore(scores)
  const album = calcAlbumScore(scores)
  if (!repair && !album) return 0
  if (!repair) return album
  if (!album) return repair
  return Math.round(((repair + album) / 2) * 10) / 10
}

function sanitizeReviewImages(images) {
  if (!Array.isArray(images)) return []
  return images.slice(0, MAX_REVIEW_IMAGES).map((url) => assertPersistentImageUrl(url)).filter(Boolean)
}

function sanitizeTags(tags) {
  if (!Array.isArray(tags)) return []
  return tags
    .map((t) => String(t || '').trim())
    .filter(Boolean)
    .slice(0, MAX_REVIEW_TAGS)
}

function sanitizeScores(raw = {}) {
  const scores = {}
  for (const key of REVIEW_DIMENSION_KEYS) {
    const n = Math.round(Number(raw[key]) || 0)
    if (n >= 1 && n <= 5) scores[key] = n
  }
  return scores
}

function assertReviewScores(scores) {
  for (const key of REVIEW_DIMENSION_KEYS) {
    if (!scores[key]) {
      const err = new Error('请完成维修服务与相册记录的全部评分')
      err.status = 400
      throw err
    }
  }
}

function mapReviewRow(row, extras = {}) {
  if (!row) return null
  const tags = Array.isArray(row.tagsJson) ? row.tagsJson : []
  const images = parseRawReviewImages(row.imagesJson)
  const scores =
    row.scoresJson && typeof row.scoresJson === 'object' ? row.scoresJson : {}
  const repairScore = row.repairScore || calcRepairScore(scores)
  const albumScore = row.albumScore || calcAlbumScore(scores)
  const publicImages = getPublicReviewImages(row)
  return {
    id: row.id,
    albumId: row.albumId,
    userId: row.userId,
    storeId: row.storeId,
    merchantId: row.merchantId,
    scores,
    repairScore,
    albumScore,
    overallScore: row.overallScore || calcOverallScore(scores),
    content: row.content || '',
    tags,
    images,
    imagesMaskStatus: row.imagesMaskStatus || REVIEW_IMAGE_MASK_STATUS.NONE,
    publicImagesReady: publicImages.imagesApproved,
    authorizePublic: Boolean(row.authorizePublic),
    status: row.status,
    merchantReply: row.merchantReply || '',
    merchantReplyAt: row.merchantReplyAt ? toIso(row.merchantReplyAt) : '',
    createdAt: toIso(row.createdAt),
    ...extras,
  }
}

function mapPublicReviewRow(row) {
  const base = mapReviewRow(row)
  if (!base) return null
  const pub = getPublicReviewImages(row)
  return {
    reviewId: base.id,
    orderId: '',
    displayName: '车主',
    overallScore: base.overallScore,
    repairScore: base.repairScore,
    albumScore: base.albumScore,
    content: base.content,
    tags: base.tags,
    serviceName: '',
    createdAtText: (base.createdAt || '').slice(0, 10),
    images: pub.images,
    imagesApproved: pub.imagesApproved,
    merchantReply: base.merchantReply || '',
    merchantReplyAt: base.merchantReplyAt || '',
  }
}

async function loadAlbumMeta(albumId, userId) {
  const album = await getUserServiceAlbum(albumId, userId)
  const row = await prisma.album.findUnique({
    where: { id: albumId },
    select: { merchantId: true, storeId: true, status: true, partsJson: true },
  })
  const eligible = COMPLETED_ALBUM_STATUSES.has(row?.status || album.status)
  const parts = Array.isArray(row?.partsJson) ? row.partsJson : []
  return {
    album,
    merchantId: row?.merchantId || '',
    storeId: row?.storeId || album.store?.id || '',
    partCount: parts.length,
    eligible,
    ineligibleReason: eligible ? '' : '维修完工后可评价本次服务',
    publicCaseStatus: album.publicCaseStatus || 'private',
  }
}

async function getAlbumReviewContext(albumId, userId) {
  const { album, eligible, ineligibleReason, publicCaseStatus } = await loadAlbumMeta(albumId, userId)
  let existing = await prisma.serviceAlbumReview.findUnique({
    where: { albumId_userId: { albumId, userId } },
  })
  if (existing) {
    existing = await ensureReviewImagesMasked(existing)
  }
  const canAuthorizePublic =
    eligible && ['private', 'user_rejected'].includes(publicCaseStatus || 'private')
  const reviewAuthorizePublic = existing ? Boolean(existing.authorizePublic) : false
  const reviewMapped = existing ? mapReviewRow(existing) : null
  return {
    albumId,
    albumTitle: album.serviceName || '我的服务相册',
    storeName: album.store?.name || '',
    eligible,
    ineligibleReason,
    publicCaseStatus,
    canAuthorizePublic,
    reviewAuthorizePublic,
    imagesMaskStatus: existing?.imagesMaskStatus || REVIEW_IMAGE_MASK_STATUS.NONE,
    publicImagesReady: reviewMapped ? reviewMapped.publicImagesReady : false,
    review: reviewMapped,
    consentText: ALBUM_REVIEW_CONSENT_TEXT,
    publicConsentText: ALBUM_REVIEW_PUBLIC_CONSENT_TEXT,
  }
}

async function submitServiceAlbumReview(albumId, userId, payload = {}) {
  const { eligible, merchantId, storeId } = await loadAlbumMeta(albumId, userId)
  if (!eligible) {
    const err = new Error('维修完工后可评价本次服务')
    err.status = 409
    throw err
  }

  const existing = await prisma.serviceAlbumReview.findUnique({
    where: { albumId_userId: { albumId, userId } },
  })
  if (existing) {
    const err = new Error('你已评价过本次服务')
    err.status = 409
    throw err
  }

  if (!payload.consent) {
    const err = new Error('请先阅读并勾选评价声明')
    err.status = 400
    throw err
  }

  const scores = sanitizeScores(payload.scores)
  assertReviewScores(scores)
  const content = String(payload.content || '').trim()
  if (content.length > MAX_REVIEW_CONTENT) {
    const err = new Error(`评价内容不超过 ${MAX_REVIEW_CONTENT} 字`)
    err.status = 400
    throw err
  }

  const repairScore = calcRepairScore(scores)
  const albumScore = calcAlbumScore(scores)
  const sanitizedImages = sanitizeReviewImages(payload.images)
  const authorizePublic = Boolean(payload.authorizePublic)
  const initialMaskStatus =
    authorizePublic && sanitizedImages.length
      ? REVIEW_IMAGE_MASK_STATUS.PENDING
      : REVIEW_IMAGE_MASK_STATUS.NONE

  let row = await prisma.serviceAlbumReview.create({
    data: {
      id: newId('arv'),
      albumId,
      userId,
      storeId,
      merchantId,
      scoresJson: scores,
      repairScore,
      albumScore,
      overallScore: calcOverallScore(scores),
      content,
      tagsJson: sanitizeTags(payload.tags),
      imagesJson: sanitizedImages,
      imagesMaskedJson: [],
      imagesMaskStatus: initialMaskStatus,
      authorizePublic,
      consent: true,
      status: ALBUM_REVIEW_STATUS.SUBMITTED,
    },
  })

  if (authorizePublic && sanitizedImages.length) {
    try {
      await maskReviewImagesForRow({
        reviewId: row.id,
        albumId,
        rawUrls: sanitizedImages,
      })
      row = await prisma.serviceAlbumReview.findUnique({ where: { id: row.id } })
    } catch (e) {
      console.warn('[review] mask images failed', {
        reviewId: row.id,
        message: e && e.message,
      })
    }
  }

  return mapReviewRow(row)
}

async function listPublicReviewsForAlbum(albumId) {
  const rows = await prisma.serviceAlbumReview.findMany({
    where: {
      albumId,
      authorizePublic: true,
      status: { in: [ALBUM_REVIEW_STATUS.SUBMITTED, ALBUM_REVIEW_STATUS.REPLIED] },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })
  const prepared = await Promise.all(rows.map((row) => ensureReviewImagesMasked(row)))
  return prepared.map(mapPublicReviewRow).filter(Boolean)
}

function resolveMerchantReviewTab(tab) {
  const value = String(tab || 'pending').trim()
  if (value === 'replied') return 'replied'
  if (value === 'all') return 'all'
  return 'pending'
}

async function listMerchantAlbumReviews(storeId, tab = 'pending') {
  const resolved = resolveMerchantReviewTab(tab)
  const where = { storeId }
  if (resolved === 'pending') {
    where.status = ALBUM_REVIEW_STATUS.SUBMITTED
    where.merchantReply = ''
  } else if (resolved === 'replied') {
    where.merchantReply = { not: '' }
    where.status = { not: ALBUM_REVIEW_STATUS.HIDDEN }
  } else {
    where.status = { not: ALBUM_REVIEW_STATUS.HIDDEN }
  }

  const rows = await prisma.serviceAlbumReview.findMany({
    where,
    orderBy: { createdAt: 'desc' },
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
    const mapped = mapReviewRow(row)
    return {
      id: row.id,
      albumId: row.albumId,
      serviceName: album?.serviceName || '服务相册',
      repairScore: mapped.repairScore,
      albumScore: mapped.albumScore,
      overallScore: mapped.overallScore,
      contentPreview: (row.content || '').slice(0, 60),
      authorizePublic: Boolean(row.authorizePublic),
      hasReply: Boolean(row.merchantReply),
      ownerHint: phoneTail ? `车主*${phoneTail}` : '车主',
      createdAt: toIso(row.createdAt),
    }
  })
}

async function fetchMerchantReviewStats(storeId) {
  const pendingReply = await prisma.serviceAlbumReview.count({
    where: {
      storeId,
      status: ALBUM_REVIEW_STATUS.SUBMITTED,
      merchantReply: '',
    },
  })
  return { pendingReply }
}

async function getMerchantAlbumReviewById(reviewId, storeId) {
  const row = await prisma.serviceAlbumReview.findUnique({ where: { id: reviewId } })
  if (!row || row.storeId !== storeId) {
    const err = new Error('评价不存在')
    err.status = 404
    throw err
  }

  const album = await prisma.album.findUnique({
    where: { id: row.albumId },
    select: {
      id: true,
      serviceName: true,
      userPhone: true,
      status: true,
    },
  })

  const phone = album?.userPhone || ''
  const phoneTail = phone.length >= 4 ? phone.slice(-4) : ''

  return {
    ...mapReviewRow(row),
    serviceName: album?.serviceName || '',
    ownerHint: phoneTail ? `车主*${phoneTail}` : '车主',
    albumStatus: album?.status || '',
  }
}

async function replyMerchantAlbumReview(reviewId, storeId, merchantUserId, payload = {}) {
  const row = await prisma.serviceAlbumReview.findUnique({ where: { id: reviewId } })
  if (!row || row.storeId !== storeId) {
    const err = new Error('评价不存在')
    err.status = 404
    throw err
  }
  if (row.status === ALBUM_REVIEW_STATUS.HIDDEN) {
    const err = new Error('该评价已隐藏')
    err.status = 409
    throw err
  }

  const reply = String(payload.reply || '').trim()
  if (!reply) {
    const err = new Error('请填写回复内容')
    err.status = 400
    throw err
  }
  if (reply.length > MAX_MERCHANT_REPLY) {
    const err = new Error(`回复不超过 ${MAX_MERCHANT_REPLY} 字`)
    err.status = 400
    throw err
  }

  const updated = await prisma.serviceAlbumReview.update({
    where: { id: reviewId },
    data: {
      merchantReply: reply,
      merchantReplyAt: new Date(),
      merchantReplierId: merchantUserId || '',
      status: ALBUM_REVIEW_STATUS.REPLIED,
    },
  })

  return getMerchantAlbumReviewById(updated.id, storeId)
}

module.exports = {
  getAlbumReviewContext,
  submitServiceAlbumReview,
  listPublicReviewsForAlbum,
  listMerchantAlbumReviews,
  fetchMerchantReviewStats,
  getMerchantAlbumReviewById,
  replyMerchantAlbumReview,
  mapPublicReviewRow,
  calcRepairScore,
  calcAlbumScore,
  calcOverallScore,
}
