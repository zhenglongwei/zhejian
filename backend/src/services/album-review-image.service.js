const { prisma } = require('../lib/prisma')
const { resolveDesensitizedUrlForAsset } = require('./media.service')

const REVIEW_IMAGE_MASK_STATUS = {
  NONE: 'none',
  PENDING: 'pending',
  READY: 'ready',
  PARTIAL: 'partial',
  FAILED: 'failed',
}

function parseRawReviewImages(imagesJson) {
  if (!Array.isArray(imagesJson)) return []
  return imagesJson
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (item && typeof item === 'object' && item.raw) return String(item.raw).trim()
      return ''
    })
    .filter(Boolean)
}

function parseMaskedReviewImages(imagesMaskedJson) {
  if (!Array.isArray(imagesMaskedJson)) return []
  return imagesMaskedJson.map((url) => String(url || '').trim()).filter(Boolean)
}

function resolveMaskStatus(rawCount, successCount) {
  if (!rawCount) return REVIEW_IMAGE_MASK_STATUS.NONE
  if (successCount <= 0) return REVIEW_IMAGE_MASK_STATUS.FAILED
  if (successCount >= rawCount) return REVIEW_IMAGE_MASK_STATUS.READY
  return REVIEW_IMAGE_MASK_STATUS.PARTIAL
}

function hasUsableMaskedImages(row) {
  const status = String(row?.imagesMaskStatus || '')
  if (![REVIEW_IMAGE_MASK_STATUS.READY, REVIEW_IMAGE_MASK_STATUS.PARTIAL].includes(status)) {
    return false
  }
  return parseMaskedReviewImages(row?.imagesMaskedJson).length > 0
}

function shouldRemaskReviewImages(row, { force = false } = {}) {
  const rawUrls = parseRawReviewImages(row?.imagesJson)
  if (!rawUrls.length) return false
  if (force) return true
  if (row.imagesMaskStatus === REVIEW_IMAGE_MASK_STATUS.PENDING) return true
  if (hasUsableMaskedImages(row)) return false
  return true
}

/**
 * 对评价配图跑脱敏引擎，masked 数组与 raw 等长（失败位为空字符串）
 */
async function maskReviewImagesForRow({ reviewId, albumId, rawUrls, force = false }) {
  const urls = (rawUrls || []).filter(Boolean)
  if (!urls.length) {
    return { maskedSlots: [], status: REVIEW_IMAGE_MASK_STATUS.NONE }
  }

  const maskedSlots = []
  for (let idx = 0; idx < urls.length; idx += 1) {
    const masked = await resolveDesensitizedUrlForAsset(urls[idx], {
      albumId,
      nodeId: 'review',
      idx,
      force,
    })
    maskedSlots.push(masked.ok && masked.maskedUrl ? masked.maskedUrl : '')
  }

  const successCount = maskedSlots.filter(Boolean).length
  const status = resolveMaskStatus(urls.length, successCount)

  if (reviewId) {
    await prisma.serviceAlbumReview.update({
      where: { id: reviewId },
      data: {
        imagesMaskedJson: maskedSlots,
        imagesMaskStatus: status,
      },
    })
  }

  return {
    maskedSlots,
    maskedUrls: maskedSlots.filter(Boolean),
    status,
  }
}

async function ensureReviewImagesMasked(row, options = {}) {
  if (!row || !shouldRemaskReviewImages(row, options)) {
    return row
  }
  const rawUrls = parseRawReviewImages(row.imagesJson)
  await prisma.serviceAlbumReview.update({
    where: { id: row.id },
    data: { imagesMaskStatus: REVIEW_IMAGE_MASK_STATUS.PENDING },
  })
  await maskReviewImagesForRow({
    reviewId: row.id,
    albumId: row.albumId,
    rawUrls,
    force: Boolean(options.force),
  })
  return prisma.serviceAlbumReview.findUnique({ where: { id: row.id } })
}

function getPublicReviewImages(row) {
  const maskedUrls = parseMaskedReviewImages(row?.imagesMaskedJson)
  const rawUrls = parseRawReviewImages(row?.imagesJson)
  const status = String(row?.imagesMaskStatus || REVIEW_IMAGE_MASK_STATUS.NONE)
  const imagesApproved =
    maskedUrls.length > 0 &&
    [REVIEW_IMAGE_MASK_STATUS.READY, REVIEW_IMAGE_MASK_STATUS.PARTIAL].includes(status) &&
    Boolean(row?.imagesPreviewConfirmed)
  return {
    images: imagesApproved ? maskedUrls : [],
    imagesApproved,
    imagesMaskStatus: status,
    hasPendingImages:
      rawUrls.length > 0 &&
      (status === REVIEW_IMAGE_MASK_STATUS.PENDING || maskedUrls.length < rawUrls.length),
  }
}

module.exports = {
  REVIEW_IMAGE_MASK_STATUS,
  parseRawReviewImages,
  parseMaskedReviewImages,
  maskReviewImagesForRow,
  ensureReviewImagesMasked,
  getPublicReviewImages,
  shouldRemaskReviewImages,
}
