/**
 * 公网评价展示名：默认「车主」+ 稳定编号（中间打码），不含微信名 / 真实 userId。
 */
function hashToDigits(input, length = 6) {
  const text = String(input || '')
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const span = 10 ** length
  const n = Math.abs(hash) % (span - 10 ** (length - 1)) + 10 ** (length - 1)
  return String(n)
}

function maskReviewerDigits(digits) {
  const raw = String(digits || '')
  if (raw.length < 4) return '****'
  return `${raw.slice(0, 2)}***${raw.slice(-2)}`
}

function publicReviewerLabel(userId) {
  const digits = hashToDigits(userId, 6)
  return `车主 ${maskReviewerDigits(digits)}`
}

module.exports = {
  hashToDigits,
  maskReviewerDigits,
  publicReviewerLabel,
}
