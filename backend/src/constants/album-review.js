/** 服务相册车主评价 · 对齐 docs/03_商家端/05_商家套餐与权益.md §5 */

const REVIEW_DIMENSION_KEYS = [
  'scoreService',
  'scoreProfessional',
  'scoreProcess',
  'scorePrice',
  'scoreResult',
  'scoreRecommend',
]

const REQUIRED_REVIEW_DIMENSION_KEYS = [
  'scoreService',
  'scoreProfessional',
  'scoreProcess',
]

const ALBUM_REVIEW_STATUS = {
  SUBMITTED: 'submitted',
  REPLIED: 'replied',
  HIDDEN: 'hidden',
}

const MAX_REVIEW_CONTENT = 500
const MAX_REVIEW_TAGS = 5
const MAX_REVIEW_IMAGES = 3
const MAX_MERCHANT_REPLY = 500

const ALBUM_REVIEW_CONSENT_TEXT =
  '我确认评价基于本次真实维修体验，不含虚假或诱导性内容；上传图片不含完整车牌、人脸等敏感信息。'

const ALBUM_REVIEW_PUBLIC_CONSENT_TEXT =
  '同意将评价摘要（脱敏后）展示在已授权公开案例中，不含个人隐私与未脱敏图片。'

module.exports = {
  REVIEW_DIMENSION_KEYS,
  REQUIRED_REVIEW_DIMENSION_KEYS,
  ALBUM_REVIEW_STATUS,
  MAX_REVIEW_CONTENT,
  MAX_REVIEW_TAGS,
  MAX_REVIEW_IMAGES,
  MAX_MERCHANT_REPLY,
  ALBUM_REVIEW_CONSENT_TEXT,
  ALBUM_REVIEW_PUBLIC_CONSENT_TEXT,
}
