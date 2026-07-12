/**
 * 协议体系元数据 — 法务定稿前占位，上线前须替换为真实主体信息
 * @see docs/12_测试验收部署与安全合规/11_协议文案汇编.md
 */
const LEGAL_VERSION = '2.0.2'

const LEGAL_EFFECTIVE_DATE = '2026-07-12'

const LEGAL_OPERATOR = {
  name: '杭州盈简科技有限公司',
  uscc: '91330114MA8GFYDX3E',
  address: '浙江省杭州市钱塘区下沙街道财通中心1512室托管2024A016',
  privacyEmail: 'business@simplewin.cn',
  privacyPhone: '18658823459',
  jurisdiction: '浙江省杭州市钱塘区',
}

/** 用户服务协议赔偿责任上限（格式条款，上线前法务确认） */
const LEGAL_LIABILITY_CAP =
  '您因使用本服务直接遭受的实际损失为限，且不超过人民币壹仟元（¥1,000）'

module.exports = {
  LEGAL_VERSION,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_OPERATOR,
  LEGAL_LIABILITY_CAP,
}
