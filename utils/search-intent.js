/** 关键词 → 默认结果 Tab 倾向（PRD §8.1 简版） */
const SERVICE_HINTS = [
  '事故车',
  '小保养',
  '保养',
  '轮胎',
  '刹车',
  '钣喷',
  '补漆',
  '喷漆',
  '电瓶',
  '空调',
  '钣金',
  '检测',
]

const CASE_HINTS = [
  '案例',
  '异响',
  '剐蹭',
  '补漆',
  '喷漆',
  '保养',
  '刹车',
  '宝马',
  '大众',
  '奥迪',
  '特斯拉',
  'model',
  '朗逸',
  '怎么办',
  '故障',
  '杭州',
  '滨江',
  '维修',
  '事故',
]

const MERCHANT_HINTS = ['门店', '维修店', '汽修', '示范店']

function inferDefaultTab(keyword) {
  const text = String(keyword || '').trim().toLowerCase()
  if (!text) return 'service'

  if (MERCHANT_HINTS.some((hint) => text.includes(hint))) {
    return 'merchant'
  }
  if (SERVICE_HINTS.some((hint) => text.includes(hint.toLowerCase()))) {
    return 'service'
  }
  if (CASE_HINTS.some((hint) => text.includes(hint.toLowerCase()))) {
    return 'case'
  }
  return 'service'
}

module.exports = {
  inferDefaultTab,
}
