const { ENV } = require('./config')
const { get, post } = require('./request')

function useApi() {
  return ENV.mode !== 'mock'
}

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchAlbumReviewContext(albumId) {
  if (useApi()) {
    return get(`/user/service-albums/${albumId}/review`)
  }
  await delay()
  return {
    albumId,
    albumTitle: '我的服务相册',
    storeName: '示例门店',
    eligible: true,
    ineligibleReason: '',
    publicCaseStatus: 'private',
    canAuthorizePublic: true,
    reviewAuthorizePublic: false,
    review: null,
    consentText: '',
    publicConsentText: '',
  }
}

async function submitAlbumReview(albumId, payload = {}) {
  if (useApi()) {
    return post(`/user/service-albums/${albumId}/review`, payload)
  }
  await delay()
  return {
    id: `arv_mock_${Date.now()}`,
    albumId,
    overallScore: payload.overallScore || 5,
    status: 'submitted',
    createdAt: new Date().toISOString(),
  }
}

async function submitAlbumReviewFollowUp(albumId, payload = {}) {
  if (useApi()) {
    return post(`/user/service-albums/${albumId}/review/follow-up`, payload)
  }
  await delay()
  return {
    id: `arv_mock_${albumId}`,
    albumId,
    followUpContent: payload.content || '',
    followUpAt: new Date().toISOString(),
    hasFollowUp: true,
    canFollowUp: false,
  }
}

module.exports = {
  fetchAlbumReviewContext,
  submitAlbumReview,
  submitAlbumReviewFollowUp,
}
