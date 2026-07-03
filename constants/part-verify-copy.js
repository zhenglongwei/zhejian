/** 配件验真 · 商家端与车主端文案（2026-07-03 口径修订） */

const MERCHANT_PART_TYPE_LOCKED_TIP =
  '此类型来自报价单识别，不可修改。若需变更，请先与车主沟通，并在「维修方案」节点上传最新报价单。'

const MERCHANT_PART_TYPE_MANUAL_TIP =
  '配件类型须与报价单一致。若与报价单不符，请先与车主沟通，并在「维修方案」节点上传最新报价单。'

const MERCHANT_PART_TYPE_CHANGE_TITLE = '无法直接修改类型'

const MERCHANT_PART_TYPE_CHANGE_CONTENT =
  '该配件类型来自报价单识别，与方案绑定。若实际使用类型有变，请先与车主沟通确认，并在「维修方案」节点上传最新报价单后重新识别。'

const MERCHANT_OWNER_VERIFY_GUIDE_TITLE = '车主验真指引（车主将按此核对）'

const MERCHANT_OWNER_VERIFY_GUIDE_STEPS = [
  { key: 'code', title: '1. 复制编码', desc: '在验真页复制相册登记的配件编码' },
  { key: 'query', title: '2. 自行查询', desc: '通过品牌官网、包装二维码或常用查询渠道核对配件信息' },
  { key: 'compare', title: '3. 对比类型', desc: '判断查询结果中的配件类型是否与相册登记（原厂/品牌/副厂等）一致' },
]

const PART_VERIFY_VALUE_LINE =
  '根据相册登记的编码自行查询，核对配件真实类型是否与门店登记一致。'

const PART_VERIFY_METHOD_TITLE = '如何验真'

const PART_VERIFY_METHOD_STEPS = [
  { key: 'code', title: '复制编码', desc: '在下方配件卡复制编码；无编码时可对照凭证图与品牌信息' },
  { key: 'query', title: '自行查询', desc: '通过品牌官网、包装二维码或常用渠道查询该编码对应配件信息' },
  { key: 'compare', title: '对比登记', desc: '看查询结果中的类型（原厂/品牌/副厂等）是否与相册登记一致' },
]

const PART_VERIFY_STEPS = PART_VERIFY_METHOD_STEPS

const PART_VERIFY_STATUS_OPTIONS = [
  { value: 'matched', label: '查询与登记一致' },
  { value: 'question', label: '有疑问' },
  { value: 'skipped', label: '暂未验真' },
]

const PART_VERIFY_CONSENT_TEXT =
  '我理解验真为本人自愿对照留痕，平台不鉴定配件真伪，也不保证与已装到车上的实物一致。'

const PART_VERIFY_DEGRADE_HINT =
  '暂无结构化方案目录；你可仍按相册登记项与编码自行查询验真。'

const PART_VERIFY_ALBUM_SECTION_TITLE = '逐件验真'

const PART_VERIFY_PLAN_SECTION_TITLE = '维修方案参考（可选）'

const PART_VERIFY_PART_CARD_HINT =
  '请按页顶「如何验真」步骤，根据编码查询结果判断是否与下方登记类型一致。'

module.exports = {
  MERCHANT_PART_TYPE_LOCKED_TIP,
  MERCHANT_PART_TYPE_MANUAL_TIP,
  MERCHANT_PART_TYPE_CHANGE_TITLE,
  MERCHANT_PART_TYPE_CHANGE_CONTENT,
  MERCHANT_OWNER_VERIFY_GUIDE_TITLE,
  MERCHANT_OWNER_VERIFY_GUIDE_STEPS,
  PART_VERIFY_VALUE_LINE,
  PART_VERIFY_METHOD_TITLE,
  PART_VERIFY_METHOD_STEPS,
  PART_VERIFY_STEPS,
  PART_VERIFY_STATUS_OPTIONS,
  PART_VERIFY_CONSENT_TEXT,
  PART_VERIFY_DEGRADE_HINT,
  PART_VERIFY_ALBUM_SECTION_TITLE,
  PART_VERIFY_PLAN_SECTION_TITLE,
  PART_VERIFY_PART_CARD_HINT,
}
