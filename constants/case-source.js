/**
 * 案例来源 — 2026-09-03：对外仅「商家上传」
 */
const CASE_SOURCE = {
  MERCHANT_UPLOAD: 'merchant_upload',
  /** @deprecated 归一为 MERCHANT_UPLOAD */
  USER_AUTHORIZED: 'user_authorized',
  /** @deprecated 归一为 MERCHANT_UPLOAD */
  MERCHANT_HISTORY: 'merchant_history',
}

const LEGACY_PLATFORM_ORDER = 'platform_order'

const CASE_SOURCE_LABEL = {
  [CASE_SOURCE.MERCHANT_UPLOAD]: '商家上传',
  [CASE_SOURCE.USER_AUTHORIZED]: '商家上传',
  [CASE_SOURCE.MERCHANT_HISTORY]: '商家上传',
}

const CASE_SOURCE_TAG_VARIANT = {
  [CASE_SOURCE.MERCHANT_UPLOAD]: 'history',
  [CASE_SOURCE.USER_AUTHORIZED]: 'history',
  [CASE_SOURCE.MERCHANT_HISTORY]: 'history',
}

function normalizeCaseSource(source) {
  if (
    source === LEGACY_PLATFORM_ORDER ||
    source === CASE_SOURCE.USER_AUTHORIZED ||
    source === CASE_SOURCE.MERCHANT_HISTORY ||
    !source
  ) {
    return CASE_SOURCE.MERCHANT_UPLOAD
  }
  return CASE_SOURCE.MERCHANT_UPLOAD
}

module.exports = {
  CASE_SOURCE,
  LEGACY_PLATFORM_ORDER,
  CASE_SOURCE_LABEL,
  CASE_SOURCE_TAG_VARIANT,
  normalizeCaseSource,
  /** @deprecated */
  PLATFORM_ORDER: CASE_SOURCE.MERCHANT_UPLOAD,
}
