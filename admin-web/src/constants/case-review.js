export const CASE_TABS = [
  { key: 'pending', label: '待审核' },
  { key: 'high_risk', label: '高风险' },
  { key: 'approved', label: '已通过' },
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
  '隐私未脱敏',
  '授权不足',
  '内容不真实',
  '违规宣传',
  '门店/资质异常',
  '纠纷/投诉',
  'SEO不合规',
]

export const COMPLIANCE_NOTICES = [
  '公开案例不代表平台对维修质量背书。',
  '价格仅供参考，复杂项目以到店检测为准。',
  '审核员仅查看脱敏图，不展示原图；请结合 OCR 摘要判断隐私风险。',
]

/** 用户授权案例：质量由商家留档负责，运营台仅审合法合规 */
export const USER_AUTHORIZED_REVIEW_NOTICE =
  '用户授权案例：相册完整度与留档质量由商家负责，车主授权用于监督公示；平台审核仅确认授权有效、脱敏合规与内容合法，不因节点缺失或证据偏弱拦截通过。'

export const DESENSITIZE_STATUS_TAG = {
  ready: { label: '已脱敏', type: 'success' },
  need_manual: { label: '需人工', type: 'warning' },
  failed: { label: '脱敏失败', type: 'danger' },
  processing: { label: '处理中', type: 'info' },
  pending: { label: '待脱敏', type: 'info' },
}
