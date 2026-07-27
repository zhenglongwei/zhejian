export const CASE_TABS = [
  { key: 'pending', label: '待审核' },
  { key: 'desensitizing', label: '脱敏处理中' },
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

export const COMPLIANCE_NOTICES = [
  '审核对象为商家确认的公示案例稿与脱敏配图，不是整本私密相册。',
  '脱敏结束后才进入待审；失败/需人工也会进待审并标出问题，可重试脱敏或驳回商家。',
  '通过后不上线；车主可查看案例稿并自行发布到公开网站。',
  '驳回后解锁商家，可改相册节点与案例稿，再次确认完工后重新进审。本期不做运营手工打码。',
]

export const USER_AUTHORIZED_REVIEW_NOTICE =
  '平台审核商家确认的公示案例内容（合法合规与隐私风险）。通过后由车主决定是否发布到公开网站。'

export const DESENSITIZE_STATUS_TAG = {
  ready: { label: '已脱敏', type: 'success' },
  need_manual: { label: '需人工', type: 'warning' },
  failed: { label: '脱敏失败', type: 'danger' },
  processing: { label: '处理中', type: 'info' },
  pending: { label: '待脱敏', type: 'info' },
}
