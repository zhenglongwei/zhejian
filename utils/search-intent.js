/** 关键词 → 默认结果 Tab 倾向（PRD §8.1 简版） */
const CASE_HINTS = [
  '案例',
  '异响',
  '剐蹭',
  '补漆',
  '喷漆',
  '事故',
  '保养',
  '宝马',
  '大众',
  '奥迪',
  '特斯拉',
  'model',
  '朗逸',
  '怎么办',
  '故障',
]

const MERCHANT_HINTS = ['门店', '维修店', '汽修', '示范店']

function inferDefaultTab(keyword) {
  const text = String(keyword || '').trim().toLowerCase()
  if (!text) return 'service'

  if (MERCHANT_HINTS.some((hint) => text.includes(hint))) {
    return 'merchant'
  }
  if (CASE_HINTS.some((hint) => text.includes(hint.toLowerCase()))) {
    return 'case'
  }
  return 'service'
}

module.exports = {
  inferDefaultTab,
}
