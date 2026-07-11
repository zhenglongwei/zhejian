/** 与 backend admin-authorization-log.service AUTH_TYPE_LABEL 同步 */
export const AUTH_TYPE_LABEL = {
  login: '登录注册',
  consult_transfer: '咨询转接',
  accident_ack: '事故车知晓',
  album_claim: '相册关联',
  case_public: '案例公开',
  desensitize_confirm: '脱敏确认',
  case_revoke: '撤回公开',
  merchant_onboard: '商家入驻',
  merchant_history: '商家历史案例',
  subscription_pay: '套餐支付',
  album_review: '相册反馈',
  review_public: '反馈公开',
  part_verify: '配件验真',
  album_feedback: '反馈转达',
  report: '内容举报',
  deactivate: '账户注销',
}

export const AUTH_TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  ...Object.entries(AUTH_TYPE_LABEL).map(([value, label]) => ({ value, label })),
]

export const AUTH_STATUS_LABEL = {
  authorized: '已授权',
  revoked: '已撤回',
}

export const CLIENT_TYPE_LABEL = {
  miniprogram: '小程序',
  h5: 'H5',
  admin: '运营后台',
}

export function authStatusLabel(status) {
  return AUTH_STATUS_LABEL[status] || status || '—'
}

export function clientTypeLabel(clientType) {
  return CLIENT_TYPE_LABEL[clientType] || clientType || '—'
}
