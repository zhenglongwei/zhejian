/**
 * 奖励记录 — V1.0 mock
 * 联调后接 GET /api/user/rewards
 */
const { ENV } = require('./config')
const { get } = require('./request')
const { mockFetchRewardRecords } = require('../mock/reviews')
const {
  REWARD_STATUS_LABEL,
  REWARD_STATUS_VARIANT,
  REWARD_SOURCE_LABEL,
} = require('../constants/reward-status')
const { formatReviewDate } = require('../utils/review-display')

function buildRewardRecordModel(record) {
  if (!record) return null
  const status = record.status || 'pending'
  return {
    rewardId: record.rewardId,
    sourceType: record.sourceType || 'review',
    sourceLabel: REWARD_SOURCE_LABEL[record.sourceType] || '活动奖励',
    orderId: record.orderId || '',
    amount: record.amount || 0,
    status,
    statusLabel: REWARD_STATUS_LABEL[status] || status,
    statusVariant: REWARD_STATUS_VARIANT[status] || 'default',
    createdAtText: formatReviewDate(record.createdAt),
    issuedAtText: formatReviewDate(record.issuedAt),
  }
}

async function fetchRewardRecords() {
  if (ENV.mode === 'mock') {
    const { list, total } = await mockFetchRewardRecords()
    return {
      list: list.map(buildRewardRecordModel).filter(Boolean),
      total,
    }
  }
  const res = await get('/user/rewards')
  return {
    list: (res.list || []).map(buildRewardRecordModel).filter(Boolean),
    total: res.total || 0,
  }
}

module.exports = {
  fetchRewardRecords,
  buildRewardRecordModel,
}
