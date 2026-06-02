/** 商家入驻 — 维修资质类型（PRD §8.2） */

const ONBOARDING_QUALIFICATION_OPTIONS = [
  { value: 'class_3', label: '三类机动车维修' },
  { value: 'class_2', label: '二类机动车维修' },
  { value: 'class_1', label: '一类机动车维修' },
  { value: 'record', label: '维修经营备案' },
  { value: 'new_energy', label: '新能源专项资质' },
]

const ONBOARDING_COMPLIANCE_TEXT =
  '我已阅读并同意：提交资料真实有效；展示内容由本店负责；平台仅提供展示与咨询转接，不作交易撮合与质量担保。'

function findQualificationLabel(value) {
  const item = ONBOARDING_QUALIFICATION_OPTIONS.find((o) => o.value === value)
  return item ? item.label : ''
}

module.exports = {
  ONBOARDING_QUALIFICATION_OPTIONS,
  ONBOARDING_COMPLIANCE_TEXT,
  findQualificationLabel,
}
