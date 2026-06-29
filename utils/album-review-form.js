const {
  calcRepairScore,
  calcAlbumScore,
  calcOverallScore,
} = require('./album-review-score')
const { emptyAlbumReviewScores, ALL_REVIEW_DIMENSIONS } = require('../constants/album-review-dimensions')
const {
  ALBUM_REVIEW_CONSENT_TEXT,
  ALBUM_REVIEW_PUBLIC_CONSENT_TEXT,
  ALBUM_REVIEW_SUCCESS_MESSAGE,
} = require('../constants/album-review')

const MAX_CONTENT = 300

const REVIEW_TAGS_REPAIR_POSITIVE = ['沟通及时', '解释清楚', '施工细致', '交付准时']
const REVIEW_TAGS_REPAIR_NEGATIVE = ['沟通不足', '等待偏长', '对结果不放心']
const REVIEW_TAGS_ALBUM_POSITIVE = ['过程记录充分', '照片清晰', '说明易懂']
const REVIEW_TAGS_ALBUM_NEGATIVE = ['缺关键阶段', '图片不清', '说明难懂']

function validateAlbumReviewForm(form) {
  const scores = form.scores || {}
  for (const dim of ALL_REVIEW_DIMENSIONS) {
    if (!scores[dim.key] || scores[dim.key] < 1) {
      return { ok: false, message: '请完成维修服务与相册记录的全部评分' }
    }
  }
  const content = String(form.content || '').trim()
  if (content.length > MAX_CONTENT) {
    return { ok: false, message: `评价内容不超过 ${MAX_CONTENT} 字` }
  }
  if (!form.consent) {
    return { ok: false, message: '请先阅读并勾选评价声明' }
  }
  return { ok: true }
}

function buildAlbumReviewPayload(form) {
  const scores = form.scores || emptyAlbumReviewScores()
  return {
    scores,
    repairScore: calcRepairScore(scores),
    albumScore: calcAlbumScore(scores),
    overallScore: calcOverallScore(scores),
    content: String(form.content || '').trim(),
    tags: form.selectedTags || [],
    images: form.images || [],
    authorizePublic: Boolean(form.authorizePublic),
    consent: Boolean(form.consent),
  }
}

function resolveReviewTagPool(scores = {}) {
  const repairAvg =
    (Number(scores.repairAttitude) + Number(scores.repairTrust)) / 2 || 0
  const albumAvg =
    (Number(scores.albumSufficiency) + Number(scores.albumClarity)) / 2 || 0
  const low = repairAvg <= 3 || albumAvg <= 3
  if (low) {
    return [...REVIEW_TAGS_REPAIR_NEGATIVE, ...REVIEW_TAGS_ALBUM_NEGATIVE]
  }
  return [...REVIEW_TAGS_REPAIR_POSITIVE, ...REVIEW_TAGS_ALBUM_POSITIVE]
}

module.exports = {
  ALBUM_REVIEW_CONSENT_TEXT,
  ALBUM_REVIEW_PUBLIC_CONSENT_TEXT,
  ALBUM_REVIEW_SUCCESS_MESSAGE,
  validateAlbumReviewForm,
  buildAlbumReviewPayload,
  resolveReviewTagPool,
}
