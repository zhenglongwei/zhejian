const { REVIEW_DIMENSIONS } = require('../constants/review-dimensions')

function calcOverallScore(scores) {
  const values = REVIEW_DIMENSIONS.map((d) => scores[d.key] || 0).filter((v) => v > 0)
  if (!values.length) return 0
  const sum = values.reduce((a, b) => a + b, 0)
  return Math.round((sum / values.length) * 10) / 10
}

module.exports = {
  calcOverallScore,
}
