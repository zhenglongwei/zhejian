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

function compactReviewText(value) {
  return String(value || '').replace(/[，,\s]+/g, '')
}

/** 点选标签曾被写入正文，导致「解释清楚」正文与标签各出现一次 */
function stripTagOnlyReviewContent(content, tags = []) {
  const text = String(content || '').trim()
  if (!text) return ''
  const list = (Array.isArray(tags) ? tags : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  if (!list.length) return text
  const compactText = compactReviewText(text)
  const joined = compactReviewText(list.join('，'))
  const concatenated = compactReviewText(list.join(''))
  if (compactText === joined || compactText === concatenated) return ''
  return text
}

function buildReviewCardModel(review) {
  if (!review) return null
  const status = review.status || REVIEW_STATUS.REVIEW_APPROVED
  const tags = review.tags || []
  return {
    reviewId: review.reviewId,
    orderId: review.orderId || '',
    displayName: buildDisplayNickname(review),
    overallScore: review.overallScore || 0,
    content: stripTagOnlyReviewContent(review.content || '', tags),
    tags,
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
  stripTagOnlyReviewContent,
  buildReviewCardModel,
  buildReviewCardList,
}
