const { ENV } = require('./config')
const { get, post } = require('./request')

async function fetchMerchantReviewStats(params = {}) {
  if (ENV.mode === 'mock') {
    return { pendingReply: 0 }
  }
  return get('/merchant/reviews/stats', params)
}

async function fetchMerchantAlbumReviews(params = {}) {
  if (ENV.mode === 'mock') {
    return []
  }
  const data = await get('/merchant/reviews', params)
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.list)) return data.list
  return []
}

async function getMerchantAlbumReviewById(reviewId, storeId) {
  if (ENV.mode === 'mock') {
    return null
  }
  return get(`/merchant/reviews/${reviewId}`, { storeId })
}

async function replyMerchantAlbumReview(reviewId, storeId, reply) {
  if (ENV.mode === 'mock') {
    return { id: reviewId, merchantReply: reply }
  }
  return post(`/merchant/reviews/${reviewId}/reply`, { storeId, reply })
}

module.exports = {
  fetchMerchantReviewStats,
  fetchMerchantAlbumReviews,
  getMerchantAlbumReviewById,
  replyMerchantAlbumReview,
}
