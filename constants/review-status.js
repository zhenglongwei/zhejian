/**
 * 评价状态
 * @see docs/02_用户端/08_评价与奖励领取.md §15
 */
const REVIEW_STATUS = {
  NOT_REVIEWED: 'not_reviewed',
  REVIEW_PENDING: 'review_pending',
  REVIEW_APPROVED: 'review_approved',
  REVIEW_REJECTED: 'review_rejected',
}

const REVIEW_STATUS_LABEL = {
  [REVIEW_STATUS.NOT_REVIEWED]: '未评价',
  [REVIEW_STATUS.REVIEW_PENDING]: '待审核',
  [REVIEW_STATUS.REVIEW_APPROVED]: '已通过',
  [REVIEW_STATUS.REVIEW_REJECTED]: '未通过',
}

const REVIEW_STATUS_VARIANT = {
  [REVIEW_STATUS.REVIEW_PENDING]: 'warning',
  [REVIEW_STATUS.REVIEW_APPROVED]: 'success',
  [REVIEW_STATUS.REVIEW_REJECTED]: 'danger',
}

module.exports = {
  REVIEW_STATUS,
  REVIEW_STATUS_LABEL,
  REVIEW_STATUS_VARIANT,
}
