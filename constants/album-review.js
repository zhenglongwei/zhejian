const ALBUM_REVIEW_CONSENT_TEXT =
  '我确认评价基于本次真实维修体验，不含虚假或诱导性内容；上传图片不含完整车牌、人脸等敏感信息。'

const ALBUM_REVIEW_PUBLIC_CONSENT_TEXT =
  '同意将评价摘要（脱敏后）展示在已授权公开案例中，不含个人隐私与未脱敏图片。'

const ALBUM_REVIEW_SUCCESS_MESSAGE =
  '感谢你的真实反馈，将帮助门店改进服务；若已授权，摘要可在公开案例中展示。'

const MERCHANT_REVIEW_LIST_TABS = [
  { key: 'pending', label: '待回复' },
  { key: 'replied', label: '已回复' },
  { key: 'all', label: '全部' },
]

module.exports = {
  ALBUM_REVIEW_CONSENT_TEXT,
  ALBUM_REVIEW_PUBLIC_CONSENT_TEXT,
  ALBUM_REVIEW_SUCCESS_MESSAGE,
  MERCHANT_REVIEW_LIST_TABS,
}
