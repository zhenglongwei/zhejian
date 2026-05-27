/**
 * 咨询线索状态 — 对齐 docs/11_数据结构与状态机/05_咨询线索状态机.md
 */
const LEAD_STATUS = {
  SUBMITTED: 'SUBMITTED',
  VIEWED: 'VIEWED',
  CONTACTED: 'CONTACTED',
  CANCELLED: 'CANCELLED',
  CLOSED: 'CLOSED',
}

/** 用户端展示文案 */
const LEAD_STATUS_LABEL = {
  [LEAD_STATUS.SUBMITTED]: '已提交',
  [LEAD_STATUS.VIEWED]: '门店已查看',
  [LEAD_STATUS.CONTACTED]: '门店已联系',
  [LEAD_STATUS.CANCELLED]: '已取消',
  [LEAD_STATUS.CLOSED]: '已关闭',
}

/** 商家端展示文案 */
const LEAD_STATUS_LABEL_MERCHANT = {
  [LEAD_STATUS.SUBMITTED]: '待处理',
  [LEAD_STATUS.VIEWED]: '已查看',
  [LEAD_STATUS.CONTACTED]: '已联系',
  [LEAD_STATUS.CANCELLED]: '用户已取消',
  [LEAD_STATUS.CLOSED]: '已关闭',
}

/** Tag variant — 对齐设计体系 §7（列表辅助） */
const LEAD_STATUS_VARIANT = {
  [LEAD_STATUS.SUBMITTED]: 'warning',
  [LEAD_STATUS.VIEWED]: 'warning',
  [LEAD_STATUS.CONTACTED]: 'info',
  [LEAD_STATUS.CANCELLED]: 'default',
  [LEAD_STATUS.CLOSED]: 'default',
}

/** LeadStatusBadge 色组 — 对齐设计体系 §6.2（咨询线索态） */
const LEAD_STATUS_TONE = {
  [LEAD_STATUS.SUBMITTED]: 'warning',
  [LEAD_STATUS.VIEWED]: 'warning',
  [LEAD_STATUS.CONTACTED]: 'primary',
  [LEAD_STATUS.CANCELLED]: 'danger',
  [LEAD_STATUS.CLOSED]: 'muted',
}

/** 用户可取消的状态 */
const LEAD_USER_CANCELLABLE = [LEAD_STATUS.SUBMITTED, LEAD_STATUS.VIEWED]

module.exports = {
  LEAD_STATUS,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_LABEL_MERCHANT,
  LEAD_STATUS_VARIANT,
  LEAD_STATUS_TONE,
  LEAD_USER_CANCELLABLE,
}
