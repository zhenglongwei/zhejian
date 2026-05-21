/**
 * 用户评价 — V1.0 mock
 * 联调后接 /api/user/orders/{order_id}/reviews
 */
const { ENV } = require('./config')
const { post, get } = require('./request')
const {
  mockFetchReviewInfo,
  mockSubmitReview,
  mockGetReviewByOrderId,
  mockFetchStoreReviews,
  mockFetchServiceReviews,
  mockFetchMyReviews,
} = require('../mock/reviews')
const { getStoreTopReviewTags } = require('../utils/review-tag-stats')
const { buildReviewCardModel } = require('../utils/review-display')

async function fetchReviewInfo(orderId) {
  if (ENV.mode === 'mock') {
    return mockFetchReviewInfo(orderId)
  }
  return get(`/user/orders/${orderId}/review-info`)
}

async function submitReview(orderId, payload) {
  if (ENV.mode === 'mock') {
    return mockSubmitReview(orderId, payload)
  }
  return post(`/user/orders/${orderId}/reviews`, payload)
}

async function fetchReviewByOrderId(orderId) {
  if (ENV.mode === 'mock') {
    await new Promise((r) => setTimeout(r, 120))
    const review = mockGetReviewByOrderId(orderId)
    return review ? buildReviewCardModel(review) : null
  }
  return get(`/user/orders/${orderId}/review`)
}

async function fetchStoreReviews(storeId, query) {
  if (ENV.mode === 'mock') {
    return mockFetchStoreReviews(storeId, query)
  }
  return get(`/stores/${storeId}/reviews`, query)
}

async function fetchServiceReviews(serviceId, query) {
  if (ENV.mode === 'mock') {
    return mockFetchServiceReviews(serviceId, query)
  }
  return get(`/services/${serviceId}/reviews`, query)
}

async function fetchMyReviews() {
  if (ENV.mode === 'mock') {
    return mockFetchMyReviews()
  }
  return get('/user/reviews')
}

async function fetchStoreTopReviewTags(storeId, limit = 3) {
  await new Promise((r) => setTimeout(r, 0))
  return getStoreTopReviewTags(storeId, limit)
}

module.exports = {
  fetchReviewInfo,
  submitReview,
  fetchReviewByOrderId,
  fetchStoreReviews,
  fetchServiceReviews,
  fetchMyReviews,
  fetchStoreTopReviewTags,
}
