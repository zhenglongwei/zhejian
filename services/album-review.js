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
    imagesMaskStatus: 'none',
    publicImagesReady: false,
    needsReviewImagePreview: false,
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
  const hasImages = Array.isArray(payload.images) && payload.images.length > 0
  return {
    id: `arv_mock_${Date.now()}`,
    albumId,
    overallScore: payload.overallScore || 5,
    status: 'submitted',
    createdAt: new Date().toISOString(),
    needsReviewImagePreview: false,
    reviewPreviewTaskId: hasImages ? `task_review_preview_arv_mock` : '',
  }
}

async function prepareReviewImagePreview(albumId) {
  if (useApi()) {
    return post(`/user/service-albums/${albumId}/review/image-preview`)
  }
  await delay()
  return {
    taskId: `task_review_preview_mock_${albumId}`,
    albumId,
    reviewId: `arv_mock_${albumId}`,
    fromPreMask: true,
  }
}

module.exports = {
  fetchAlbumReviewContext,
  submitAlbumReview,
  prepareReviewImagePreview,
}
