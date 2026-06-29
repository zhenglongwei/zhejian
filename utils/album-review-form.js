const { calcOverallScore } = require('./review-score')
const { emptyReviewScores } = require('../constants/review-dimensions')
const {
  ALBUM_REVIEW_CONSENT_TEXT,
  ALBUM_REVIEW_PUBLIC_CONSENT_TEXT,
  ALBUM_REVIEW_SUCCESS_MESSAGE,
} = require('../constants/album-review')

const REQUIRED_KEYS = ['scoreService', 'scoreProfessional', 'scoreProcess']
const MAX_CONTENT = 500

function validateAlbumReviewForm(form) {
  const scores = form.scores || {}
  for (const key of REQUIRED_KEYS) {
    if (!scores[key] || scores[key] < 1) {
      return { ok: false, message: '请完成服务态度、专业程度与维修过程透明三项评分' }
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
  const scores = form.scores || emptyReviewScores()
  return {
    scores,
    overallScore: calcOverallScore(scores),
    content: String(form.content || '').trim(),
    tags: form.selectedTags || [],
    images: form.images || [],
    authorizePublic: Boolean(form.authorizePublic),
    consent: Boolean(form.consent),
  }
}

module.exports = {
  ALBUM_REVIEW_CONSENT_TEXT,
  ALBUM_REVIEW_PUBLIC_CONSENT_TEXT,
  ALBUM_REVIEW_SUCCESS_MESSAGE,
  validateAlbumReviewForm,
  buildAlbumReviewPayload,
}
