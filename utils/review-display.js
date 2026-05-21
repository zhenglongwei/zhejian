const {
  REVIEW_STATUS,
  REVIEW_STATUS_LABEL,
  REVIEW_STATUS_VARIANT,
} = require('../constants/review-status')

function formatReviewDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function buildDisplayNickname(review) {
  if (!review) return '用户'
  if (review.anonymous) return '匿名用户'
  return review.nickname || '用户*'
}

function buildReviewCardModel(review) {
  if (!review) return null
  const status = review.status || REVIEW_STATUS.REVIEW_APPROVED
  return {
    reviewId: review.reviewId,
    orderId: review.orderId || '',
    displayName: buildDisplayNickname(review),
    overallScore: review.overallScore || 0,
    content: review.content || '',
    tags: review.tags || [],
    serviceName: review.serviceName || '',
    createdAtText: formatReviewDate(review.createdAt),
    status,
    statusLabel: REVIEW_STATUS_LABEL[status] || '',
    statusVariant: REVIEW_STATUS_VARIANT[status] || 'default',
    showStatus: status !== REVIEW_STATUS.REVIEW_APPROVED,
  }
}

function buildReviewCardList(reviews) {
  return (reviews || [])
    .map(buildReviewCardModel)
    .filter(Boolean)
}

module.exports = {
  formatReviewDate,
  buildDisplayNickname,
  buildReviewCardModel,
  buildReviewCardList,
}
