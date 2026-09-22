/**
 * 托管店页 · 类目只提示往哪看，不再预置必答题。
 * 问答从本单亮点抽取，见 merchant-case-job-faq.js 与 07_案例生成规则 §10。
 */
const DIRECTIONS = [
  '预算：是套餐还是检查后再定，有没有加项，哪些这次没做。不写金额。',
  '材料：规格、品牌、包装或新旧件，档案里有才写。',
  '避坑：本单写了的质保、工序；可以不做而本单没做或写了依据的，也写。',
]

const FAQ_BANK = {
  maintenance: { label: '保养' },
  major_maintenance: { label: '大保养' },
  chassis_noise: { label: '底盘' },
  brake: { label: '刹车' },
  battery: { label: '电瓶' },
  tire: { label: '轮胎' },
  ac: { label: '空调' },
  body_paint: { label: '钣喷' },
  accident: { label: '事故' },
  default: { label: '通用维修' },
}

function resolveFaqBankCategoryId(categoryId = '') {
  const key = String(categoryId || '').trim()
  if (FAQ_BANK[key]) return key
  if (key === 'chassis' || key === 'chassis_repair') return 'chassis_noise'
  return 'default'
}

function getHostedStorefrontFaqBank(categoryId = '') {
  const id = resolveFaqBankCategoryId(categoryId)
  const row = FAQ_BANK[id] || FAQ_BANK.default
  return {
    categoryId: id,
    label: row.label,
    directions: DIRECTIONS.slice(),
  }
}

module.exports = {
  FAQ_BANK,
  DIRECTIONS,
  getHostedStorefrontFaqBank,
  resolveFaqBankCategoryId,
}
