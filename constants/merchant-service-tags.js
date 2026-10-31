/**
 * 商家入驻 — 擅长服务预设标签
 * PRD: docs/03_商家端/01_商家入驻PRD.md §9
 */
const MERCHANT_SERVICE_TAG_OPTIONS = [
  '小保养',
  '刹车维修',
  '电瓶更换',
  '轮胎服务',
  '空调维修',
  '钣喷修复',
  '底盘维修',
  '事故车维修',
  '新能源维修',
]

const MERCHANT_SERVICE_TAG_MAX = 10
const MERCHANT_SERVICE_TAG_NAME_MAX = 16

/** 门店「服务能力」展示名。旧预设读出来按新名显示和保存。 */
const MERCHANT_SERVICE_TAG_DISPLAY = {
  小保养: '保养',
}

function displayMerchantServiceTag(name) {
  const text = String(name || '').trim()
  return MERCHANT_SERVICE_TAG_DISPLAY[text] || text
}

function normalizeMerchantServiceTags(list) {
  const seen = Object.create(null)
  const out = []
  ;(list || []).forEach((item) => {
    const name = displayMerchantServiceTag(item)
    if (!name || seen[name]) return
    seen[name] = true
    out.push(name)
  })
  return out
}

module.exports = {
  MERCHANT_SERVICE_TAG_OPTIONS,
  MERCHANT_SERVICE_TAG_MAX,
  MERCHANT_SERVICE_TAG_NAME_MAX,
  displayMerchantServiceTag,
  normalizeMerchantServiceTags,
}
