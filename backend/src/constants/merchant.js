/** 商家主体状态 — 对齐 docs/11/03 商家入驻状态机（MVP 子集） */
const MERCHANT_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_AUDIT: 'PENDING_AUDIT',
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
  APPROVED: 'approved',
  REJECTED: 'rejected',
}

function toFrontStatus(dbStatus) {
  switch (dbStatus) {
    case MERCHANT_STATUS.DRAFT:
      return FRONT_STATUS.DRAFT
    case MERCHANT_STATUS.PENDING_AUDIT:
      return FRONT_STATUS.PENDING
    case MERCHANT_STATUS.ACTIVE:
      return FRONT_STATUS.APPROVED
    case MERCHANT_STATUS.AUDIT_REJECTED:
      return FRONT_STATUS.REJECTED
    default:
      return FRONT_STATUS.NONE
  }
}

module.exports = {
  MERCHANT_STATUS,
  STORE_STATUS,
  FRONT_STATUS,
  toFrontStatus,
}
