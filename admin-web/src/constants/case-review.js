export const CASE_TABS = [
  { key: 'approved', label: '已公开' },
  { key: 'pending', label: '历史待审' },
  { key: 'desensitizing', label: '脱敏处理中' },
  { key: 'rejected', label: '已驳回' },
]

export const CASE_SOURCE_OPTIONS = [
  { value: '', label: '全部来源' },
  { value: 'user_authorized', label: '用户授权案例' },
  { value: 'cold_start', label: '冷启动' },
  { value: 'merchant_history', label: '商家历史案例' },
]

export const RISK_LEVEL_OPTIONS = [
  { value: '', label: '全部风险' },
  { value: 'low', label: '低风险' },
  { value: 'medium', label: '中风险' },
  { value: 'high', label: '高风险' },
  { value: 'forbidden', label: '禁止公开' },
]

export const RISK_LEVEL_LABEL = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  forbidden: '禁止公开',
}

export const REJECT_REASONS = [
  'banned_phrase',
  'external_contact',
  'privacy',
  'misleading',
  'other',
]

export const GATE_B_REJECT_LABEL = {
  banned_phrase: '违规宣传/禁词',
  external_contact: '外部导流/联系方式',
  privacy: '隐私未处理好',
  misleading: '表述不实或误导',
  other: '其他',
  desensitize_incomplete: '脱敏不完整',
  desensitize_manual: '需手工脱敏',
  review_content: '评价文案',
  review_image: '评价配图',
  authorization: '授权信息',
  user_content: '用户侧内容',
}

/** D14：上网主路径为人机审+商家确认；本台保留抽检/投诉/历史待审 */
export const COMPLIANCE_NOTICES = [
  '新案例上网不再经本台「待审」主路径：商家生成 → 机审过线 → 确认发布即上店页。',
  '本列表「历史待审」仅存量/冷启动遗留；日常请用已公开抽检与举报下架处理事后风险。',
  '抽检下架与投诉处理仍可用；不挡新单上线。',
]

export const USER_AUTHORIZED_REVIEW_NOTICE =
  '平台事后抽检公开案例的合规与隐私风险；上网门禁以机审真实性与脱敏硬门槛为准。'

export const DESENSITIZE_STATUS_TAG = {
  ready: { label: '已脱敏', type: 'success' },
  need_manual: { label: '需人工', type: 'warning' },
  failed: { label: '脱敏失败', type: 'danger' },
  processing: { label: '处理中', type: 'info' },
  pending: { label: '待脱敏', type: 'info' },
}
