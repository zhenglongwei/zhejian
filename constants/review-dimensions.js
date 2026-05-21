/**
 * 六维评价维度（设计体系 §8.3）
 */
const REVIEW_DIMENSIONS = [
  { key: 'scoreService', label: '服务态度' },
  { key: 'scoreProfessional', label: '专业程度' },
  { key: 'scorePrice', label: '价格透明' },
  { key: 'scoreProcess', label: '维修过程透明' },
  { key: 'scoreResult', label: '完工效果' },
  { key: 'scoreRecommend', label: '是否愿意推荐' },
]

const COLLAPSE_FROM_INDEX = 3

function emptyReviewScores() {
  return REVIEW_DIMENSIONS.reduce((acc, dim) => {
    acc[dim.key] = 0
    return acc
  }, {})
}

module.exports = {
  REVIEW_DIMENSIONS,
  COLLAPSE_FROM_INDEX,
  emptyReviewScores,
}
