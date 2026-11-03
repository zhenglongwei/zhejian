/**
 * 商家四档月费目录（真源：docs/03_商家端/05_商家套餐与权益.md）
 * 额度本期不在后台改；只改价。
 */

const MERCHANT_PLAN = {
  TASTE: 'taste',
  MICRO: 'micro',
  STANDARD: 'standard',
  SCALE: 'scale',
  /** 兼容旧码 */
  FREE: 'free',
  INDEX_99: 'index_99',
  OPTIMIZE_299: 'optimize_299',
}

const MERCHANT_PLAN_ORDER = [
  MERCHANT_PLAN.TASTE,
  MERCHANT_PLAN.MICRO,
  MERCHANT_PLAN.STANDARD,
  MERCHANT_PLAN.SCALE,
]

function quotaPair(n) {
  const label = `≤${n}个`
  return {
    albumUnlimited: true,
    caseQuota: n,
    caseQuotaLabel: label,
    aiQuota: n,
    aiQuotaLabel: label,
    publicHostQuota: n,
    publicHostQuotaLabel: label,
  }
}

const DEFAULT_PLAN_CATALOG = {
  [MERCHANT_PLAN.TASTE]: {
    planCode: MERCHANT_PLAN.TASTE,
    name: '尝鲜版',
    ...quotaPair(3),
    priceCents: 2900,
  },
  [MERCHANT_PLAN.MICRO]: {
    planCode: MERCHANT_PLAN.MICRO,
    name: '小微店',
    ...quotaPair(20),
    priceCents: 8900,
  },
  [MERCHANT_PLAN.STANDARD]: {
    planCode: MERCHANT_PLAN.STANDARD,
    name: '标准店',
    ...quotaPair(100),
    priceCents: 24900,
  },
  [MERCHANT_PLAN.SCALE]: {
    planCode: MERCHANT_PLAN.SCALE,
    name: '规模店',
    ...quotaPair(200),
    priceCents: 49900,
  },
}

const CATALOG_SETTING_KEY = 'merchant_plan_catalog_prices'

const FEATURE_ROWS = [
  { key: 'album', label: '相册生成' },
  { key: 'ai', label: 'AI分析' },
  { key: 'publicHost', label: '公开托管' },
  { key: 'price', label: '价格' },
]

function yuanLabelFromCents(cents) {
  const n = Number(cents)
  if (!Number.isFinite(n) || n < 0) return ''
  const yuan = n / 100
  const text = Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2)
  return `¥${text}/月`
}

function isSellablePlanCode(code) {
  return MERCHANT_PLAN_ORDER.indexOf(String(code || '')) >= 0
}

module.exports = {
  MERCHANT_PLAN,
  MERCHANT_PLAN_ORDER,
  DEFAULT_PLAN_CATALOG,
  CATALOG_SETTING_KEY,
  FEATURE_ROWS,
  yuanLabelFromCents,
  isSellablePlanCode,
}
