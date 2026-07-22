/**
 * 价格展示模式 — 与 PriceDisplay、设计体系对齐
 *
 * 商家录入 / 用户展示主路径仅两档：
 * - fixed：一口价
 * - consult：到店检测后确定（参考价选填）
 *
 * range / accident 仅兼容存量数据，展示前须 normalizePriceMode。
 */
const PRICE_MODE = {
  FIXED: 'fixed',
  /** @deprecated 存量兼容，展示归一为 consult */
  RANGE: 'range',
  CONSULT: 'consult',
  /** @deprecated 存量兼容，展示归一为 consult */
  ACCIDENT: 'accident',
}

const PRICE_MODE_LABEL = {
  [PRICE_MODE.FIXED]: '一口价',
  [PRICE_MODE.RANGE]: '到店检测后确定',
  [PRICE_MODE.CONSULT]: '到店检测后确定',
  [PRICE_MODE.ACCIDENT]: '到店检测后确定',
}

/** 商家新建/编辑可选价格模式 */
const PRICE_MODE_OPTIONS = [
  { value: PRICE_MODE.FIXED, label: '一口价' },
  { value: PRICE_MODE.CONSULT, label: '到店检测后确定' },
]

/**
 * 归一为录入两档：一口价 / 到店检测后确定
 * @param {string} mode
 * @returns {'fixed'|'consult'}
 */
function normalizePriceMode(mode) {
  if (mode === PRICE_MODE.FIXED) return PRICE_MODE.FIXED
  return PRICE_MODE.CONSULT
}

/**
 * 到店检测档的参考价（单数）；兼容存量区间价取下限或单值
 * @param {{ amount?: number|null, minAmount?: number|null, maxAmount?: number|null }} fields
 * @returns {number|null}
 */
function resolveReferenceAmount(fields = {}) {
  const amount = fields.amount != null ? Number(fields.amount) : NaN
  if (Number.isFinite(amount)) return amount
  const min = fields.minAmount != null ? Number(fields.minAmount) : NaN
  if (Number.isFinite(min)) return min
  const max = fields.maxAmount != null ? Number(fields.maxAmount) : NaN
  if (Number.isFinite(max)) return max
  return null
}

/**
 * 是否为事故车类目（合规勾选等用类目，不再用价格模式）
 * @param {{ categoryId?: string, serviceItemId?: string }|null|undefined} record
 */
function isAccidentCategory(record) {
  if (!record) return false
  if (record.categoryId === 'cat_accident') return true
  if (record.serviceItemId === 'item_accident') return true
  return false
}

module.exports = {
  PRICE_MODE,
  PRICE_MODE_LABEL,
  PRICE_MODE_OPTIONS,
  normalizePriceMode,
  resolveReferenceAmount,
  isAccidentCategory,
}
