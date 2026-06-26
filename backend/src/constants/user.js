const USER_STATUS = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
  CANCELLED: 'CANCELLED',
}

const DEACTIVATE_BLOCKER = {
  ALREADY_CANCELLED: 'already_cancelled',
  PENDING_CONTENT_REPORT: 'pending_content_report',
  PENDING_ALBUM_FEEDBACK: 'pending_album_feedback',
  ACTIVE_MERCHANT_OWNER: 'active_merchant_owner',
}

const DEACTIVATE_BLOCKER_MESSAGE = {
  [DEACTIVATE_BLOCKER.ALREADY_CANCELLED]: '账号已注销',
  [DEACTIVATE_BLOCKER.PENDING_CONTENT_REPORT]:
    '你有进行中的投诉/举报工单，请等待处理完成后再申请注销',
  [DEACTIVATE_BLOCKER.PENDING_ALBUM_FEEDBACK]:
    '你有进行中的相册反馈工单，请等待处理完成后再申请注销',
  [DEACTIVATE_BLOCKER.ACTIVE_MERCHANT_OWNER]:
    '你名下有有效商家账号，请先联系客服处理商家身份后再注销',
}

/** 允许个人注销的商家状态（草稿/驳回/已关闭可忽略） */
const MERCHANT_OWNER_DEACTIVATE_ALLOW = new Set([
  'DRAFT',
  'AUDIT_REJECTED',
  'CLOSED',
])

module.exports = {
  USER_STATUS,
  DEACTIVATE_BLOCKER,
  DEACTIVATE_BLOCKER_MESSAGE,
  MERCHANT_OWNER_DEACTIVATE_ALLOW,
}
