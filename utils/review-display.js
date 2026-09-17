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

function normalizeReviewTags(tags) {
  if (tags == null || tags === '') return []
  if (typeof tags === 'string') {
    const trimmed = tags.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('[')) {
      try {
        return normalizeReviewTags(JSON.parse(trimmed))
      } catch (e) {
        return [trimmed]
      }
    }
    return [trimmed]
  }
  if (!Array.isArray(tags)) return []
  return tags
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (item && typeof item === 'object') {
        return String(item.text || item.label || item.name || '').trim()
      }
      return String(item || '').trim()
    })
    .filter(Boolean)
}

/** 点选标签曾被写入正文：正文去掉标签/短语后若无剩余，则只展示标签 */
function stripTagOnlyReviewContent(content, tags = []) {
  const text = String(content || '').trim()
  if (!text) return ''
  const list = normalizeReviewTags(tags)
  if (!list.length) return text
  let remaining = text
  const phrases = []
  try {
    const { getReviewTagPhrase } = require('../constants/review-tags')
    list.forEach((tag) => {
      const phrase = getReviewTagPhrase(tag)
      if (phrase) phrases.push(phrase)
    })
  } catch (e) {
    // backend 无同一常量时，只用标签原文
  }
  ;[...list, ...phrases]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .forEach((chunk) => {
      remaining = remaining.split(chunk).join('')
    })
  remaining = remaining.replace(/[，,、。.!！？?\s]+/g, '').trim()
  return remaining ? text : ''
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
  normalizeReviewTags,
  stripTagOnlyReviewContent,
  buildReviewCardModel,
  buildReviewCardList,
}
