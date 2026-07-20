/** 商家入驻 — 维修资质类型（PRD §8.2：基础等级 + 新能源专项可并存） */

const ONBOARDING_BASE_QUALIFICATION_OPTIONS = [
  { value: 'class_3', label: '三类机动车维修' },
  { value: 'class_2', label: '二类机动车维修' },
  { value: 'class_1', label: '一类机动车维修' },
  { value: 'record', label: '维修经营备案' },
]

const ONBOARDING_NEW_ENERGY_OPTION = {
  value: 'new_energy',
  label: '新能源专项资质',
}

/** @deprecated 完整列表仅用于标签查找；入驻基础 picker 请用 ONBOARDING_BASE_QUALIFICATION_OPTIONS */
const ONBOARDING_QUALIFICATION_OPTIONS = ONBOARDING_BASE_QUALIFICATION_OPTIONS.concat([
  ONBOARDING_NEW_ENERGY_OPTION,
])

const { AUTHORIZATION_CONSENT } = require('./compliance-copy')

const ONBOARDING_AGREEMENT_LINK = '《商家服务协议》'

const ONBOARDING_COMPLIANCE_TEXT = AUTHORIZATION_CONSENT.merchant_onboard.text

function buildOnboardingConsentParts() {
  const text = ONBOARDING_COMPLIANCE_TEXT
  const linkIndex = text.indexOf(ONBOARDING_AGREEMENT_LINK)
  if (linkIndex < 0) {
    return { before: text, after: '' }
  }
  return {
    before: text.slice(0, linkIndex),
    after: text.slice(linkIndex + ONBOARDING_AGREEMENT_LINK.length),
  }
}

function findQualificationLabel(value) {
  const item = ONBOARDING_QUALIFICATION_OPTIONS.find((o) => o.value === value)
  return item ? item.label : ''
}

module.exports = {
  ONBOARDING_BASE_QUALIFICATION_OPTIONS,
  ONBOARDING_NEW_ENERGY_OPTION,
  ONBOARDING_QUALIFICATION_OPTIONS,
  ONBOARDING_COMPLIANCE_TEXT,
  ONBOARDING_AGREEMENT_LINK,
  buildOnboardingConsentParts,
  findQualificationLabel,
}
