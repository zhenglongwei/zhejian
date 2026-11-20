/**
 * 车主评价配图：他自己拍、他自己发，平台不代他判断隐私，不打码也不核对。
 * 公开与否只认车主那一个授权开关 authorizePublic；撤回授权，配图随之下线。
 */

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

function getPublicReviewImages(row = {}) {
  const images = parseRawReviewImages(row.imagesJson)
  const imagesApproved = images.length > 0 && Boolean(row.authorizePublic)
  return { images: imagesApproved ? images : [], imagesApproved }
}

/** 追评配图与主评同一口径：车主授权过就随评价公开 */
function getPublicFollowUpImages(row = {}) {
  const images = parseRawReviewImages(row.followUpImagesJson)
  const imagesApproved = images.length > 0 && Boolean(row.authorizePublic)
  return { images: imagesApproved ? images : [], imagesApproved }
}

module.exports = {
  parseRawReviewImages,
  getPublicReviewImages,
  getPublicFollowUpImages,
}
