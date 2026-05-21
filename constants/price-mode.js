/**
 * 价格展示模式 — 与 PriceDisplay、设计体系 §6.1 对齐
 */
const PRICE_MODE = {
  FIXED: 'fixed',
  RANGE: 'range',
  CONSULT: 'consult',
  ACCIDENT: 'accident',
}

const PRICE_MODE_LABEL = {
  [PRICE_MODE.FIXED]: '一口价',
  [PRICE_MODE.RANGE]: '参考区间',
  [PRICE_MODE.CONSULT]: '到店检测',
  [PRICE_MODE.ACCIDENT]: '事故车',
}

module.exports = {
  PRICE_MODE,
  PRICE_MODE_LABEL,
}
