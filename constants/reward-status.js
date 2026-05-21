/**
 * 奖励记录状态
 * @see docs/08_评价奖励与分享收益/02_评价奖励规则.md
 */
const REWARD_STATUS = {
  PENDING: 'pending',
  ISSUED: 'issued',
  FROZEN: 'frozen',
  REJECTED: 'rejected',
}

const REWARD_STATUS_LABEL = {
  [REWARD_STATUS.PENDING]: '待发放',
  [REWARD_STATUS.ISSUED]: '已发放',
  [REWARD_STATUS.FROZEN]: '已冻结',
  [REWARD_STATUS.REJECTED]: '未发放',
}

const REWARD_STATUS_VARIANT = {
  [REWARD_STATUS.PENDING]: 'warning',
  [REWARD_STATUS.ISSUED]: 'success',
  [REWARD_STATUS.FROZEN]: 'warning',
  [REWARD_STATUS.REJECTED]: 'danger',
}

const REWARD_SOURCE_LABEL = {
  review: '评价奖励',
  share: '分享收益',
}

module.exports = {
  REWARD_STATUS,
  REWARD_STATUS_LABEL,
  REWARD_STATUS_VARIANT,
  REWARD_SOURCE_LABEL,
}
