/** 商家主体状态 — 对齐 docs/11/03 商家入驻状态机（MVP 子集） */
const MERCHANT_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_AUDIT: 'PENDING_AUDIT',
  NEED_MODIFY: 'NEED_MODIFY',
  ACTIVE: 'ACTIVE',
  AUDIT_REJECTED: 'AUDIT_REJECTED',
  SUSPENDED: 'SUSPENDED',
  CLOSED: 'CLOSED',
}

const STORE_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_AUDIT: 'PENDING_AUDIT',
  ACTIVE: 'ACTIVE',
  OFFLINE: 'OFFLINE',
}

/** 前端 services/merchant.js 使用的 status 值 */
const FRONT_STATUS = {
  NONE: 'none',
  DRAFT: 'draft',
  PENDING: 'pending',
  NEED_MODIFY: 'need_modify',
  APPROVED: 'approved',
  REJECTED: 'rejected',
}

const MERCHANT_STATUS_LABEL = {
  [MERCHANT_STATUS.DRAFT]: '草稿',
  [MERCHANT_STATUS.PENDING_AUDIT]: '待审核',
  [MERCHANT_STATUS.NEED_MODIFY]: '需修改',
  [MERCHANT_STATUS.ACTIVE]: '已通过',
  [MERCHANT_STATUS.AUDIT_REJECTED]: '已驳回',
  [MERCHANT_STATUS.SUSPENDED]: '已冻结',
  [MERCHANT_STATUS.CLOSED]: '已关闭',
}

function toFrontStatus(dbStatus) {
  switch (dbStatus) {
    case MERCHANT_STATUS.DRAFT:
      return FRONT_STATUS.DRAFT
    case MERCHANT_STATUS.PENDING_AUDIT:
      return FRONT_STATUS.PENDING
    case MERCHANT_STATUS.NEED_MODIFY:
      return FRONT_STATUS.NEED_MODIFY
    case MERCHANT_STATUS.ACTIVE:
      return FRONT_STATUS.APPROVED
    case MERCHANT_STATUS.AUDIT_REJECTED:
      return FRONT_STATUS.REJECTED
    default:
      return FRONT_STATUS.NONE
  }
}

function merchantStatusLabel(dbStatus) {
  return MERCHANT_STATUS_LABEL[dbStatus] || dbStatus || ''
}

module.exports = {
  MERCHANT_STATUS,
  STORE_STATUS,
  FRONT_STATUS,
  MERCHANT_STATUS_LABEL,
  toFrontStatus,
  merchantStatusLabel,
}
