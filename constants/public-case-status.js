/**
 * 订单相册 → 公开案例状态（相册 V3）
 * @see docs/04_维修过程相册/06_自动脱敏规则.md §4
 */
const PUBLIC_CASE_STATUS = {
  PRIVATE: 'private',
  AUTHORIZED: 'authorized',
  PENDING_REVIEW: 'pending_review',
  PUBLIC_APPROVED: 'public_approved',
  USER_REJECTED: 'user_rejected',
}

/** 用户端订单相册 publicCaseStatus 展示键 */
const PUBLIC_CASE_UI_STATUS = {
  private: 'private',
  authorization_pending: 'authorization_pending',
  authorized: 'authorized',
  pending_review: 'pending_review',
  public_approved: 'public_approved',
  user_rejected: 'user_rejected',
}

module.exports = {
  PUBLIC_CASE_STATUS,
  PUBLIC_CASE_UI_STATUS,
}
