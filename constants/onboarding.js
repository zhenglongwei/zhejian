/** 商家入驻 — 维修资质类型（PRD §8.2） */

const ONBOARDING_QUALIFICATION_OPTIONS = [
  { value: 'class_3', label: '三类机动车维修' },
  { value: 'class_2', label: '二类机动车维修' },
  { value: 'class_1', label: '一类机动车维修' },
  { value: 'record', label: '维修经营备案' },
  { value: 'new_energy', label: '新能源专项资质' },
]

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
  ONBOARDING_QUALIFICATION_OPTIONS,
  ONBOARDING_COMPLIANCE_TEXT,
  ONBOARDING_AGREEMENT_LINK,
  buildOnboardingConsentParts,
  findQualificationLabel,
}
