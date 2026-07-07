/** 配件验真 · 商家端与车主端文案（2026-07-03 口径修订） */

const MERCHANT_PART_TYPE_LOCKED_TIP =
  '此类型来自报价单识别，不可修改。若需变更，请先与车主沟通，并在「维修方案」节点上传最新报价单。'

const MERCHANT_PART_TYPE_MANUAL_TIP =
  '配件类型须与报价单一致。若与报价单不符，请先与车主沟通，并在「维修方案」节点上传最新报价单。'

const MERCHANT_PART_TYPE_CHANGE_TITLE = '无法直接修改类型'

const MERCHANT_PART_TYPE_CHANGE_CONTENT =
  '该配件类型来自报价单识别，与方案绑定。若实际使用类型有变，请先与车主沟通确认，并在「维修方案」节点上传最新报价单后重新识别。'

const MERCHANT_PART_VERIFY_GUIDE_TITLE = '车主验真方式（二选一）'

const MERCHANT_PART_VERIFY_GUIDE_HINT =
  '不同品牌与来源的验真渠道差异较大，请按本单配件填写；将展示在车主验真页。'

const MERCHANT_PART_VERIFY_GUIDE_MODE_TEXT_TITLE = '填写验真说明'

const MERCHANT_PART_VERIFY_GUIDE_MODE_TEXT_DESC = '车主可在验真页查看以下说明'

const MERCHANT_PART_VERIFY_GUIDE_MODE_INFORMED_TITLE = '已告知车主'

const MERCHANT_PART_VERIFY_GUIDE_MODE_INFORMED_DESC = '已通过线下/电话等方式说明，无需在平台填写'

const MERCHANT_PART_VERIFY_GUIDE_PLACEHOLDER =
  '例：海拉配件请访问品牌官网，在「配件查询」输入包装编码核对类型与真伪信息。'

/** @deprecated 使用双卡片模式文案 */
const MERCHANT_PART_VERIFY_GUIDE_INFORMED_LABEL = MERCHANT_PART_VERIFY_GUIDE_MODE_INFORMED_TITLE

const PART_VERIFY_VALUE_LINE = '根据编码查询，核对登记类型'

const PART_VERIFY_BOUNDARY_LINES = [
  { key: 'plan', text: '方案/报价：商家留痕，可选查阅' },
  { key: 'album', text: '相册登记：复制编码查询，对比登记类型' },
]

const PART_VERIFY_UPLOAD_HINT =
  '补充图片避免完整车牌、人脸、证件等敏感信息，仅你与门店可见。'

const PART_VERIFY_METHOD_STEPS = [
  { step: '1', title: '复制编码', desc: '从下方配件卡复制登记编码' },
  { step: '2', title: '自行查询', desc: '按门店验真方式在品牌官网或指定渠道查询' },
  { step: '3', title: '对比登记类型', desc: '核对查询结果的配件类型是否与相册登记一致' },
]

const PART_VERIFY_METHOD_TITLE = '门店验真方式'

const PART_VERIFY_STORE_METHOD_INFORMED =
  '门店已告知验真方式，请按门店现场或电话说明操作。'

const PART_VERIFY_STORE_METHOD_FALLBACK =
  '门店尚未在平台填写验真方式，请按门店现场或电话提供的方案验真。'

const PART_VERIFY_GUIDE_FEEDBACK_TITLE = '验真方式是否有问题？（选填）'

const PART_VERIFY_GUIDE_FEEDBACK_OPTIONS = [
  { value: 'no_guide', label: '门店未提供验真方法' },
  { value: 'invalid', label: '验真方法无效或无法使用' },
]

const PART_VERIFY_STATUS_OPTIONS = [
  { value: 'matched', label: '查询与登记一致' },
  { value: 'question', label: '有疑问' },
  { value: 'skipped', label: '暂未验真' },
]

const PART_VERIFY_CONSENT_TEXT =
  '我理解配件验真为本人自愿对照留痕。相册展示的是门店登记与过程图，不能证明配件已装到车上；平台不鉴定配件真伪，也不保证与车上实物一致。更换关键件建议在场或到店复核，可向门店查看旧件、包装与编码标签。'

const PART_VERIFY_DEGRADE_HINT =
  '暂无结构化方案目录；你可仍按门店验真方式与相册登记项核对。'

const PART_VERIFY_ALBUM_SECTION_TITLE = '逐件验真'

const PART_VERIFY_PLAN_SECTION_TITLE = '维修方案参考（可选）'

const PART_VERIFY_PART_CARD_HINT =
  '请按页顶「门店验真方式」核对下方登记配件是否与实际情况一致。'

const PART_VERIFY_STEPS = PART_VERIFY_METHOD_STEPS

module.exports = {
  MERCHANT_PART_TYPE_LOCKED_TIP,
  MERCHANT_PART_TYPE_MANUAL_TIP,
  MERCHANT_PART_TYPE_CHANGE_TITLE,
  MERCHANT_PART_TYPE_CHANGE_CONTENT,
  MERCHANT_PART_VERIFY_GUIDE_TITLE,
  MERCHANT_PART_VERIFY_GUIDE_HINT,
  MERCHANT_PART_VERIFY_GUIDE_MODE_TEXT_TITLE,
  MERCHANT_PART_VERIFY_GUIDE_MODE_TEXT_DESC,
  MERCHANT_PART_VERIFY_GUIDE_MODE_INFORMED_TITLE,
  MERCHANT_PART_VERIFY_GUIDE_MODE_INFORMED_DESC,
  MERCHANT_PART_VERIFY_GUIDE_PLACEHOLDER,
  MERCHANT_PART_VERIFY_GUIDE_INFORMED_LABEL,
  PART_VERIFY_VALUE_LINE,
  PART_VERIFY_BOUNDARY_LINES,
  PART_VERIFY_UPLOAD_HINT,
  PART_VERIFY_METHOD_TITLE,
  PART_VERIFY_STORE_METHOD_INFORMED,
  PART_VERIFY_STORE_METHOD_FALLBACK,
  PART_VERIFY_GUIDE_FEEDBACK_TITLE,
  PART_VERIFY_GUIDE_FEEDBACK_OPTIONS,
  PART_VERIFY_METHOD_STEPS,
  PART_VERIFY_STEPS,
  PART_VERIFY_STATUS_OPTIONS,
  PART_VERIFY_CONSENT_TEXT,
  PART_VERIFY_DEGRADE_HINT,
  PART_VERIFY_ALBUM_SECTION_TITLE,
  PART_VERIFY_PLAN_SECTION_TITLE,
  PART_VERIFY_PART_CARD_HINT,
}
