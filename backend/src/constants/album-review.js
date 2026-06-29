/** 服务相册车主评价 · 维修服务 + 相册记录 双域四维 */

const REPAIR_REVIEW_KEYS = ['repairAttitude', 'repairTrust']
const ALBUM_REVIEW_KEYS = ['albumSufficiency', 'albumClarity']

const REVIEW_DIMENSION_KEYS = [...REPAIR_REVIEW_KEYS, ...ALBUM_REVIEW_KEYS]

const REVIEW_DIMENSION_GROUPS = [
  {
    key: 'repair',
    title: '维修服务',
    dimensions: [
      {
        key: 'repairAttitude',
        label: '服务态度',
        hint: '沟通是否尊重、及时、耐心',
      },
      {
        key: 'repairTrust',
        label: '专业可靠',
        hint: '诊断与施工是否让人放心',
      },
    ],
  },
  {
    key: 'album',
    title: '相册记录',
    dimensions: [
      {
        key: 'albumSufficiency',
        label: '过程记录是否充分',
        hint: '关键节点是否都有，且图片能否说明当时车况',
      },
      {
        key: 'albumClarity',
        label: '图文是否清楚',
        hint: '照片能否看清，说明能否读懂',
      },
    ],
  },
]

const ALBUM_REVIEW_STATUS = {
  SUBMITTED: 'submitted',
  REPLIED: 'replied',
  HIDDEN: 'hidden',
}

const PART_VERIFY_STATUS = {
  MATCHED: 'matched',
  QUESTION: 'question',
  SKIPPED: 'skipped',
}

const VALID_PART_VERIFY_STATUSES = new Set(Object.values(PART_VERIFY_STATUS))

const MAX_REVIEW_CONTENT = 300
const MAX_REVIEW_TAGS = 4
const MAX_REVIEW_IMAGES = 3
const MAX_MERCHANT_REPLY = 500
const MAX_PART_VERIFY_NOTE = 200
const MAX_PART_VERIFY_IMAGES = 3

const ALBUM_REVIEW_CONSENT_TEXT =
  '我确认评价基于本次真实维修体验，不含虚假或诱导性内容；上传图片不含完整车牌、人脸等敏感信息。'

const ALBUM_REVIEW_PUBLIC_CONSENT_TEXT =
  '同意将评价摘要（脱敏后）展示在已授权公开案例中，不含个人隐私与未脱敏图片。'

const PART_VERIFY_CONSENT_TEXT =
  '我理解平台不鉴定配件真伪，仅留存我的自愿核对记录，不代替门店告知义务。'

module.exports = {
  REPAIR_REVIEW_KEYS,
  ALBUM_REVIEW_KEYS,
  REVIEW_DIMENSION_KEYS,
  REVIEW_DIMENSION_GROUPS,
  ALBUM_REVIEW_STATUS,
  PART_VERIFY_STATUS,
  VALID_PART_VERIFY_STATUSES,
  MAX_REVIEW_CONTENT,
  MAX_REVIEW_TAGS,
  MAX_REVIEW_IMAGES,
  MAX_MERCHANT_REPLY,
  MAX_PART_VERIFY_NOTE,
  MAX_PART_VERIFY_IMAGES,
  ALBUM_REVIEW_CONSENT_TEXT,
  ALBUM_REVIEW_PUBLIC_CONSENT_TEXT,
  PART_VERIFY_CONSENT_TEXT,
}
