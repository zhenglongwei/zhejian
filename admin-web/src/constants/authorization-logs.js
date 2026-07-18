/** 与 backend admin-authorization-log.service AUTH_TYPE_LABEL 同步 */
export const AUTH_TYPE_LABEL = {
  login: '登录注册',
  consult_transfer: '咨询转接',
  accident_ack: '事故车知晓',
  album_claim: '相册关联',
  album_processing: '相册影像处理',
  share_raw: '原图分享确认',
  merchant_album_owner: '商家车主扫码确认',
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
  { value: 'case_public', label: '案例公开' },
  { value: 'case_revoke', label: '撤回公开' },
  { value: 'album_claim', label: '相册关联' },
  { value: 'album_processing', label: '相册影像处理' },
  { value: 'desensitize_confirm', label: '脱敏确认' },
  { value: 'merchant_onboard', label: '商家入驻' },
  { value: 'merchant_history', label: '商家历史案例' },
  { value: 'report', label: '内容举报' },
  { value: 'deactivate', label: '账户注销' },
  { value: 'login', label: '登录注册' },
  { value: 'consult_transfer', label: '咨询转接' },
  { value: 'accident_ack', label: '事故车知晓' },
  { value: 'subscription_pay', label: '套餐支付' },
  { value: 'album_review', label: '相册反馈' },
  { value: 'review_public', label: '反馈公开' },
  { value: 'part_verify', label: '配件验真' },
  { value: 'album_feedback', label: '反馈转达' },
  { value: 'share_raw', label: '原图分享确认' },
  { value: 'merchant_album_owner', label: '商家车主扫码确认' },
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
