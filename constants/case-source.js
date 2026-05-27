/**
 * 案例来源 — V2.0 消费者层两类，UI 样式统一，差异在来源 Tag
 * @see docs/00_开发优先级.md §R1.4
 */
const CASE_SOURCE = {
  USER_AUTHORIZED: 'user_authorized',
  MERCHANT_HISTORY: 'merchant_history',
}

/** V1 遗留值，读取时归一化为 USER_AUTHORIZED */
const LEGACY_PLATFORM_ORDER = 'platform_order'

const CASE_SOURCE_LABEL = {
  [CASE_SOURCE.USER_AUTHORIZED]: '用户授权案例',
  [CASE_SOURCE.MERCHANT_HISTORY]: '商家历史案例',
}

/** 来源对应 Tag variant（设计体系 §7.2；授权案例复用 order 色板） */
const CASE_SOURCE_TAG_VARIANT = {
  [CASE_SOURCE.USER_AUTHORIZED]: 'order',
  [CASE_SOURCE.MERCHANT_HISTORY]: 'history',
}

function normalizeCaseSource(source) {
  if (source === LEGACY_PLATFORM_ORDER) {
    return CASE_SOURCE.USER_AUTHORIZED
  }
  return source
}

module.exports = {
  CASE_SOURCE,
  LEGACY_PLATFORM_ORDER,
  CASE_SOURCE_LABEL,
  CASE_SOURCE_TAG_VARIANT,
  normalizeCaseSource,
  /** @deprecated 使用 CASE_SOURCE.USER_AUTHORIZED */
  PLATFORM_ORDER: CASE_SOURCE.USER_AUTHORIZED,
}
