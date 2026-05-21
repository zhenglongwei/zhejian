/**
 * 金额格式（项目统一：元，保留 2 位小数；整数可不显示 .00）
 * @param {number} yuan
 * @param {object} [opts]
 * @param {boolean} [opts.forceDecimal]
 */
function formatYuan(yuan, opts = {}) {
  if (yuan === null || yuan === undefined || Number.isNaN(Number(yuan))) {
    return '--'
  }
  const n = Number(yuan)
  if (!opts.forceDecimal && Number.isInteger(n)) {
    return String(n)
  }
  return n.toFixed(2)
}

function formatPriceRange(min, max, currency = '¥') {
  if (min == null && max == null) return `${currency}--`
  if (min != null && max != null && min !== max) {
    return `${currency}${formatYuan(min)}-${formatYuan(max)}`
  }
  const v = min != null ? min : max
  return `${currency}${formatYuan(v)}`
}

module.exports = {
  formatYuan,
  formatPriceRange,
}
