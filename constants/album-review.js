const {
  ALBUM_REVIEW_CONSENT_TEXT,
  ALBUM_REVIEW_PUBLIC_CONSENT_TEXT,
  ALBUM_REVIEW_SUCCESS_MESSAGE,
  MERCHANT_REVIEW_LIST_TABS,
} = require('./album-review')

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
