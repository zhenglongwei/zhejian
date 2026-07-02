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
  { value: 'matched', label: '方案与相册一致' },
  { value: 'question', label: '不一致或有疑问' },
  { value: 'skipped', label: '暂未验真' },
]

const PART_VERIFY_CONSENT_TEXT =
  '我理解验真为本人自愿对照留痕，平台不鉴定配件真伪，也不保证与已装到车上的实物一致。'

const PART_VERIFY_SUCCESS_MESSAGE = '验真记录已保存，你可随时回来补充或修改。'

const PART_VERIFY_PAGE_TITLE = '配件验真'

const PART_VERIFY_ENTRY_LABEL = '配件验真'

const PART_VERIFY_VALUE_LINE =
  '对照维修方案与相册登记的配件，判断是否与当时约定一致。'

const PART_VERIFY_STEPS = [
  { key: 'plan', title: '看方案', desc: '了解维修方案中约定的配件与类型' },
  { key: 'album', title: '对相册', desc: '查看相册登记项与凭证图，编码可自行查询' },
  { key: 'onsite', title: '在场更佳', desc: '关键更换建议在场；已完工可到店复核' },
]

const PART_VERIFY_DEGRADE_HINT =
  '暂无结构化方案配件目录，仅可按相册登记项验真；完整对照需门店在方案节点上传报价表并锁定配件目录。'

const PART_VERIFY_ONSITE_REMINDER =
  '相册记录的是门店上传的登记与过程图，无法证明配件已正确装到车上。建议更换关键件时在场见证；若已完工，可联系门店展示旧件、包装或编码标签。平台不鉴定配件真伪，也不远程验收车上实物。'

const PART_VERIFY_ALBUM_SECTION_TITLE = '相册登记配件'

const PART_VERIFY_PLAN_SECTION_TITLE = '维修方案摘要'

const PART_VERIFY_EXTRA_SECTION_TITLE = '方案外增项'

const PART_VERIFY_FIELD_DIFF_LABELS = {
  name: '名称',
  partType: '配件类型',
  partBrand: '品牌',
  partCode: '编码',
  qty: '数量',
}

const PART_VERIFY_LINK_STATUS_HINT = {
  plan_only: '方案中有此项，相册尚未登记',
  album_only: '相册登记项，未出现在方案目录中',
  field_diff: '部分字段与方案不一致，请自行判断',
}

module.exports = {
  ALBUM_REVIEW_CONSENT_TEXT,
  ALBUM_REVIEW_PUBLIC_CONSENT_TEXT,
  ALBUM_REVIEW_SUCCESS_MESSAGE,
  MERCHANT_REVIEW_LIST_TABS,
  PART_VERIFY_STATUS_OPTIONS,
  PART_VERIFY_CONSENT_TEXT,
  PART_VERIFY_SUCCESS_MESSAGE,
  PART_VERIFY_PAGE_TITLE,
  PART_VERIFY_ENTRY_LABEL,
  PART_VERIFY_VALUE_LINE,
  PART_VERIFY_STEPS,
  PART_VERIFY_DEGRADE_HINT,
  PART_VERIFY_ONSITE_REMINDER,
  PART_VERIFY_ALBUM_SECTION_TITLE,
  PART_VERIFY_PLAN_SECTION_TITLE,
  PART_VERIFY_EXTRA_SECTION_TITLE,
  PART_VERIFY_FIELD_DIFF_LABELS,
  PART_VERIFY_LINK_STATUS_HINT,
}
