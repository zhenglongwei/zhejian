/**
 * 协议体系元数据 — 法务定稿前占位，上线前须替换为真实主体信息
 * @see docs/12_测试验收部署与安全合规/11_协议文案汇编.md
 */
const LEGAL_VERSION = '2.0.0'

const LEGAL_EFFECTIVE_DATE = '2026-07-11'

const LEGAL_OPERATOR = {
  name: '【辙见运营主体全称】',
  uscc: '【统一社会信用代码】',
  address: '【注册地址】',
  privacyEmail: '【个人信息保护负责人/客服邮箱】',
  privacyPhone: '【客服电话，如有】',
  jurisdiction: '【辙见运营主体住所地】',
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
