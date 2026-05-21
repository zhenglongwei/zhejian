/** 评价标签池 — 正向 / 低分可选负向 */
const REVIEW_TAGS_POSITIVE = [
  '服务专业',
  '价格透明',
  '沟通及时',
  '维修细致',
  '交付准时',
  '过程透明',
  '相册清晰',
]

const REVIEW_TAGS_NEGATIVE = [
  '等待较久',
  '沟通不及时',
  '价格不清晰',
  '维修效果不满意',
  '交付延期',
  '服务态度一般',
]

/** 点击标签填入文字区的短语（可后续接运营配置） */
const REVIEW_TAG_PHRASES = {
  服务专业: '服务比较专业',
  价格透明: '价格说明比较透明',
  沟通及时: '沟通比较及时',
  维修细致: '维修过程比较细致',
  交付准时: '交付比较准时',
  过程透明: '维修过程比较透明',
  相册清晰: '维修相册记录比较清晰',
  等待较久: '等待时间偏长',
  沟通不及时: '沟通不够及时',
  价格不清晰: '价格说明不够清晰',
  维修效果不满意: '对维修效果不太满意',
  交付延期: '交付有所延期',
  服务态度一般: '服务态度一般',
}

function getReviewTagPhrase(tag) {
  return REVIEW_TAG_PHRASES[tag] || tag
}

module.exports = {
  REVIEW_TAGS_POSITIVE,
  REVIEW_TAGS_NEGATIVE,
  REVIEW_TAG_PHRASES,
  getReviewTagPhrase,
}
