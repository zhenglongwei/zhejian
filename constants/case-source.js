/**
 * 案例来源 — 消费者层仅两类，UI 样式统一，差异在来源 Tag
 * @see docs/00_开发优先级.md
 */
const CASE_SOURCE = {
  PLATFORM_ORDER: 'platform_order',
  MERCHANT_HISTORY: 'merchant_history',
}

const CASE_SOURCE_LABEL = {
  [CASE_SOURCE.PLATFORM_ORDER]: '平台订单案例',
  [CASE_SOURCE.MERCHANT_HISTORY]: '商家历史案例',
}

/** 来源对应 Tag variant（设计体系 §7.2） */
const CASE_SOURCE_TAG_VARIANT = {
  [CASE_SOURCE.PLATFORM_ORDER]: 'order',
  [CASE_SOURCE.MERCHANT_HISTORY]: 'history',
}

module.exports = {
  CASE_SOURCE,
  CASE_SOURCE_LABEL,
  CASE_SOURCE_TAG_VARIANT,
}
