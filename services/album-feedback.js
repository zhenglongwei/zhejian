/**
 * 服务相册问题反馈 — U-ALB-10
 */
const { ENV } = require('./config')
const { post } = require('./request')

function useApi() {
  return ENV.mode !== 'mock'
}

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms))
}

async function submitAlbumFeedback(albumId, payload = {}) {
  if (useApi()) {
    return post(`/user/service-albums/${albumId}/feedback`, payload)
  }
  await delay()
  return {
    id: `afb_mock_${Date.now()}`,
    albumId,
    nodeId: payload.nodeId || '',
    nodeTitle: payload.nodeTitle || '',
    feedbackType: payload.feedbackType,
    description: payload.description,
    images: payload.images || [],
    contactPhone: payload.contactPhone || '',
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
}

module.exports = {
  submitAlbumFeedback,
}
