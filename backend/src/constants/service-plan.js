/** 商家服务方案上架状态（B-SVC-03；2026-06-02 定调：无前置平台审核，仅抽查处罚） */

const PLAN_AUDIT_STATUS = {
  DRAFT: 'DRAFT',
  /** @deprecated 前置审核已取消，仅兼容历史数据 */
  PENDING_AUDIT: 'PENDING_AUDIT',
  APPROVED: 'APPROVED',
  /** @deprecated 改用 saleStatus=SUSPENDED + rejectReason 处罚说明 */
  REJECTED: 'REJECTED',
  NEED_MODIFY: 'NEED_MODIFY',
}

const PLAN_SALE_STATUS = {
  OFFLINE: 'OFFLINE',
  ONLINE: 'ONLINE',
  SUSPENDED: 'SUSPENDED',
}

const PLAN_AUDIT_LABEL = {
  [PLAN_AUDIT_STATUS.DRAFT]: '草稿',
  [PLAN_AUDIT_STATUS.PENDING_AUDIT]: '待审核',
  [PLAN_AUDIT_STATUS.APPROVED]: '已发布',
  [PLAN_AUDIT_STATUS.REJECTED]: '已驳回',
  [PLAN_AUDIT_STATUS.NEED_MODIFY]: '需修改',
}

const PLAN_SALE_LABEL = {
  [PLAN_SALE_STATUS.OFFLINE]: '未上架',
  [PLAN_SALE_STATUS.ONLINE]: '已上架',
  [PLAN_SALE_STATUS.SUSPENDED]: '平台强制下架',
}

const CLIENT_STATUS = {
  DRAFT: 'draft',
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  REJECTED: 'rejected',
  NEED_MODIFY: 'need_modify',
  SUSPENDED: 'suspended',
}

function deriveClientStatus(plan) {
  if (!plan) return CLIENT_STATUS.DRAFT
  const sale = plan.saleStatus

  if (sale === PLAN_SALE_STATUS.SUSPENDED) return CLIENT_STATUS.SUSPENDED
  if (sale === PLAN_SALE_STATUS.ONLINE) return CLIENT_STATUS.PUBLISHED
  if (plan.auditStatus === PLAN_AUDIT_STATUS.DRAFT) return CLIENT_STATUS.DRAFT
  return CLIENT_STATUS.APPROVED
}

function auditStatusLabel(status) {
  return PLAN_AUDIT_LABEL[status] || status
}

function saleStatusLabel(status) {
  return PLAN_SALE_LABEL[status] || status
}

/** 用户端可见：已上架且未被平台处罚下架（暂停预约仍可浏览） */
function isPubliclyVisible(plan) {
  return plan.saleStatus === PLAN_SALE_STATUS.ONLINE
}

module.exports = {
  PLAN_AUDIT_STATUS,
  PLAN_SALE_STATUS,
  PLAN_AUDIT_LABEL,
  PLAN_SALE_LABEL,
  CLIENT_STATUS,
  deriveClientStatus,
  auditStatusLabel,
  saleStatusLabel,
  isPubliclyVisible,
}
