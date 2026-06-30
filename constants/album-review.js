const ALBUM_REVIEW_CONSENT_TEXT =
  '我确认评价基于本次真实维修体验，不含虚假或诱导性内容；上传图片不含完整车牌、人脸等敏感信息。'

const ALBUM_REVIEW_PUBLIC_CONSENT_TEXT =
  '同意将评价文字、评分与脱敏后配图展示在已授权公开案例中。'

const ALBUM_REVIEW_SUCCESS_MESSAGE =
  '感谢你的真实反馈，将帮助门店改进服务；若已授权，摘要可在公开案例中展示。'

const MERCHANT_REVIEW_LIST_TABS = [
  { key: 'pending', label: '待回复' },
  { key: 'replied', label: '已回复' },
  { key: 'all', label: '全部' },
]

const PART_VERIFY_STATUS_OPTIONS = [
  { value: 'matched', label: '与登记一致' },
  { value: 'question', label: '有疑问' },
  { value: 'skipped', label: '暂未核对' },
]

const PART_VERIFY_CONSENT_TEXT =
  '我理解平台不鉴定配件真伪，仅留存我的自愿核对记录，不代替门店告知义务。'

const PART_VERIFY_SUCCESS_MESSAGE = '核对记录已保存，你可随时回来补充或修改。'

module.exports = {
  ALBUM_REVIEW_CONSENT_TEXT,
  ALBUM_REVIEW_PUBLIC_CONSENT_TEXT,
  ALBUM_REVIEW_SUCCESS_MESSAGE,
  MERCHANT_REVIEW_LIST_TABS,
  PART_VERIFY_STATUS_OPTIONS,
  PART_VERIFY_CONSENT_TEXT,
  PART_VERIFY_SUCCESS_MESSAGE,
}
