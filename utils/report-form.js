const {
  REPORT_TYPE_OPTIONS,
  REPORT_CONSENT_TEXT,
} = require('../../constants/report')

function getTargetTypeLabel(targetType) {
  const map = { service: '服务', store: '门店', case: '案例' }
  return map[targetType] || '内容'
}

function validateReportForm(form) {
  if (!form.reportType) {
    return { ok: false, message: '请选择举报类型' }
  }
  const desc = String(form.description || '').trim()
  if (desc.length < 10) {
    return { ok: false, message: '问题说明至少 10 字' }
  }
  if (desc.length > 500) {
    return { ok: false, message: '问题说明不超过 500 字' }
  }
  const phone = String(form.contactPhone || '').replace(/\D/g, '')
  if (phone && phone.length !== 11) {
    return { ok: false, message: '联系手机号格式不正确' }
  }
  if (!form.consent) {
    return { ok: false, message: '请先阅读并勾选举报声明' }
  }
  return { ok: true }
}

module.exports = {
  REPORT_TYPE_OPTIONS,
  REPORT_CONSENT_TEXT,
  getTargetTypeLabel,
  validateReportForm,
}
