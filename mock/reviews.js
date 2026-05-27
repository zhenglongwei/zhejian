/**
 * MOCK — 用户评价与奖励（V1.0 Phase B/C）
 */
const { REVIEW_STATUS } = require('../constants/review-status')
const { REVIEW_DIMENSIONS } = require('../constants/review-dimensions')
const { ORDER_STATUS } = require('../constants/order-status')
const { mockGetOrder, updateOrderInStorage } = require('./orders')
const { isLoggedIn } = require('../utils/auth')
const { getVehicleSummary } = require('../utils/order-display')
const { calcOverallScore } = require('../utils/review-score')
const { incrementStoreTagStats } = require('../utils/review-tag-stats')
const { buildReviewCardModel } = require('../utils/review-display')

const STORAGE_REVIEWS = 'user_reviews_v1'
const STORAGE_REWARDS = 'user_reward_records_v1'
const STORAGE_SEED_INIT = 'review_seed_init_v1'
const MOCK_REWARD_AMOUNT = 10

const SEED_REVIEWS = [
  {
    reviewId: 'rev_seed_1',
    orderId: 'ord_seed_review_1',
    storeId: 'store_demo_1',
    serviceId: 'svc_seed_1',
    serviceName: '小保养',
    storeName: '辙见示范店（杭州滨江）',
    scores: {
      scoreService: 5,
      scoreProfessional: 5,
      scorePrice: 4,
      scoreProcess: 5,
      scoreResult: 5,
      scoreRecommend: 5,
    },
    overallScore: 4.8,
    tags: ['服务专业', '价格透明'],
    content: '保养过程比较透明，师傅会说明机油标号差异，整体体验不错。',
    images: [],
    anonymous: false,
    nickname: '李*',
    status: REVIEW_STATUS.REVIEW_APPROVED,
    createdAt: '2026-05-08T10:20:00.000Z',
  },
  {
    reviewId: 'rev_seed_2',
    orderId: 'ord_seed_review_2',
    storeId: 'store_demo_1',
    serviceId: 'svc_seed_2',
    serviceName: '刹车片更换',
    storeName: '辙见示范店（杭州滨江）',
    scores: {
      scoreService: 4,
      scoreProfessional: 5,
      scorePrice: 4,
      scoreProcess: 5,
      scoreResult: 4,
      scoreRecommend: 4,
    },
    overallScore: 4.3,
    tags: ['维修细致', '过程透明'],
    content: '刹车异响问题已解决，服务相册记录清晰，价格区间事先有说明。',
    images: [],
    anonymous: true,
    nickname: '',
    status: REVIEW_STATUS.REVIEW_APPROVED,
    createdAt: '2026-05-11T15:40:00.000Z',
  },
  {
    reviewId: 'rev_seed_3',
    orderId: 'ord_seed_review_3',
    storeId: 'store_demo_1',
    serviceId: 'svc_seed_2',
    serviceName: '刹车片更换',
    storeName: '辙见示范店（杭州滨江）',
    scores: {
      scoreService: 5,
      scoreProfessional: 4,
      scorePrice: 5,
      scoreProcess: 4,
      scoreResult: 5,
      scoreRecommend: 5,
    },
    overallScore: 4.7,
    tags: ['沟通及时', '交付准时'],
    content: '预约时间准时，交车前做了试车说明。',
    images: [],
    anonymous: false,
    nickname: '王*',
    status: REVIEW_STATUS.REVIEW_APPROVED,
    createdAt: '2026-05-14T09:10:00.000Z',
  },
]

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms))
}

function loadReviews() {
  try {
    return wx.getStorageSync(STORAGE_REVIEWS) || []
  } catch (e) {
    return []
  }
}

function saveReviews(list) {
  wx.setStorageSync(STORAGE_REVIEWS, list)
}

function loadRewards() {
  try {
    return wx.getStorageSync(STORAGE_REWARDS) || []
  } catch (e) {
    return []
  }
}

function saveRewards(list) {
  wx.setStorageSync(STORAGE_REWARDS, list)
}

function ensureSeedTagStats() {
  try {
    if (wx.getStorageSync(STORAGE_SEED_INIT)) return
  } catch (e) {
    /* continue init */
  }
  SEED_REVIEWS.forEach((review) => {
    incrementStoreTagStats(review.storeId, review.tags || [])
  })
  try {
    wx.setStorageSync(STORAGE_SEED_INIT, true)
  } catch (e) {
    /* ignore */
  }
}

function enrichReview(review) {
  if (!review) return null
  if (review.serviceName && review.storeName) return { ...review }
  const order = review.orderId ? mockGetOrder(review.orderId) : null
  return {
    ...review,
    serviceName: review.serviceName || (order && order.serviceName) || '',
    storeName: review.storeName || (order && order.storeName) || '',
  }
}

function mergeAllReviews() {
  ensureSeedTagStats()
  const map = new Map()
  SEED_REVIEWS.forEach((item) => map.set(item.orderId, { ...item }))
  loadReviews().forEach((item) => map.set(item.orderId, { ...item }))
  return Array.from(map.values())
    .map(enrichReview)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
}

function filterApproved(reviews) {
  return reviews.filter((r) => r.status === REVIEW_STATUS.REVIEW_APPROVED)
}

function canReviewOrder(order) {
  if (!order) return { ok: false, message: '订单不存在或已被删除。' }
  if (order.status !== ORDER_STATUS.COMPLETED) {
    return { ok: false, message: '订单完成后才可以评价。' }
  }
  if (order.reviewStatus && order.reviewStatus !== REVIEW_STATUS.NOT_REVIEWED) {
    return { ok: false, message: '该订单已评价，无需重复提交。' }
  }
  if (order.refundStatus === 'refunded') {
    return { ok: false, message: '已退款订单不可评价。' }
  }
  return { ok: true }
}

async function mockFetchReviewInfo(orderId) {
  await delay()
  if (!isLoggedIn()) {
    const err = new Error('请先登录')
    err.code = 401
    throw err
  }
  const order = mockGetOrder(orderId)
  if (!order) {
    const err = new Error('订单不存在或已被删除。')
    err.code = 404
    throw err
  }
  const gate = canReviewOrder(order)
  if (!gate.ok) {
    const err = new Error(gate.message)
    err.code = 409
    throw err
  }

  return {
    orderId: order.id,
    serviceName: order.serviceName,
    storeName: order.storeName,
    storeId: order.storeId,
    serviceId: order.serviceId,
    completedAt: order.completedAt || order.updatedAt,
    vehicleSummary: getVehicleSummary(order.vehicle),
    orderNoTail: order.id ? order.id.slice(-4) : '',
    rewardAmount: MOCK_REWARD_AMOUNT,
    rewardLeadText: `完成六维评分并提交，审核通过后发放 ¥${MOCK_REWARD_AMOUNT}。文字与图片选填，与好评与否无关。`,
    maxContentLength: 300,
    maxImages: 9,
  }
}

async function mockSubmitReview(orderId, payload) {
  await delay(360)
  if (!isLoggedIn()) {
    const err = new Error('请先登录')
    err.code = 401
    throw err
  }
  const order = mockGetOrder(orderId)
  const gate = canReviewOrder(order)
  if (!gate.ok) {
    const err = new Error(gate.message)
    err.code = 409
    throw err
  }

  const scores = payload.scores || {}
  const missing = REVIEW_DIMENSIONS.find((d) => !scores[d.key] || scores[d.key] < 1)
  if (missing) {
    const err = new Error('请完成全部六维评分。')
    err.code = 400
    throw err
  }

  const content = (payload.content || '').trim()
  if (content.length > 300) {
    const err = new Error('评价内容不超过 300 字。')
    err.code = 400
    throw err
  }
  if (!payload.liabilityAccepted) {
    const err = new Error('请确认评价内容基于真实服务体验。')
    err.code = 400
    throw err
  }

  const reviewId = `rev_${orderId}_${Date.now()}`
  const overallScore = calcOverallScore(scores)
  const review = {
    reviewId,
    orderId,
    merchantId: order.merchantId || '',
    storeId: order.storeId,
    serviceId: order.serviceId,
    serviceName: order.serviceName,
    storeName: order.storeName,
    scores,
    overallScore,
    tags: payload.tags || [],
    content,
    images: payload.images || [],
    anonymous: !!payload.anonymous,
    nickname: payload.anonymous ? '' : '我',
    status: REVIEW_STATUS.REVIEW_APPROVED,
    createdAt: new Date().toISOString(),
  }

  const reviews = loadReviews().filter((r) => r.orderId !== orderId)
  reviews.unshift(review)
  saveReviews(reviews)

  incrementStoreTagStats(order.storeId, payload.tags || [])

  updateOrderInStorage(orderId, {
    reviewStatus: REVIEW_STATUS.REVIEW_APPROVED,
    reviewId,
  })

  const rewardId = `rwd_${reviewId}`
  const reward = {
    rewardId,
    sourceType: 'review',
    sourceId: reviewId,
    orderId,
    rewardType: 'balance_reward',
    amount: MOCK_REWARD_AMOUNT,
    status: 'issued',
    issuedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }
  const rewards = loadRewards()
  rewards.unshift(reward)
  saveRewards(rewards)

  return { review, reward }
}

function mockGetReviewByOrderId(orderId) {
  return mergeAllReviews().find((r) => r.orderId === orderId) || null
}

async function mockFetchStoreReviews(storeId, query = {}) {
  await delay()
  ensureSeedTagStats()
  const limit = query.limit != null ? query.limit : 5
  let list = filterApproved(mergeAllReviews()).filter((r) => r.storeId === storeId)
  if (limit > 0) list = list.slice(0, limit)
  return {
    list: list.map(buildReviewCardModel),
    total: filterApproved(mergeAllReviews()).filter((r) => r.storeId === storeId).length,
  }
}

async function mockFetchServiceReviews(serviceId, query = {}) {
  await delay()
  ensureSeedTagStats()
  const limit = query.limit != null ? query.limit : 5
  let list = filterApproved(mergeAllReviews()).filter((r) => r.serviceId === serviceId)
  if (limit > 0) list = list.slice(0, limit)
  return {
    list: list.map(buildReviewCardModel),
    total: filterApproved(mergeAllReviews()).filter((r) => r.serviceId === serviceId).length,
  }
}

async function mockFetchMyReviews() {
  await delay()
  if (!isLoggedIn()) {
    const err = new Error('请先登录')
    err.code = 401
    throw err
  }
  const list = loadReviews()
    .map(enrichReview)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  return {
    list: list.map(buildReviewCardModel),
    total: list.length,
  }
}

async function mockFetchRewardRecords() {
  await delay()
  if (!isLoggedIn()) {
    const err = new Error('请先登录')
    err.code = 401
    throw err
  }
  const list = loadRewards().sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '')
  )
  return { list, total: list.length }
}

module.exports = {
  mockFetchReviewInfo,
  mockSubmitReview,
  mockGetReviewByOrderId,
  mockFetchStoreReviews,
  mockFetchServiceReviews,
  mockFetchMyReviews,
  mockFetchRewardRecords,
  loadReviews,
  loadRewards,
  SEED_REVIEWS,
}
