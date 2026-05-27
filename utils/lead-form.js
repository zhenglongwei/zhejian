const { PRICE_MODE } = require('../constants/price-mode')

function getSubmitButtonLabel(priceMode, mode = 'service') {
  if (mode === 'message') return '提交留言'
  if (priceMode === PRICE_MODE.ACCIDENT) return '预约到店检测'
  if (priceMode === PRICE_MODE.FIXED) return '咨询预约'
  return '预约到店'
}

function getConsultPageTitle(mode = 'service') {
  return mode === 'message' ? '留言' : '咨询预约'
}

/**
 * @param {object} form
 * @param {{ isAccident?: boolean }} opts
 */
function validateLeadForm(form, opts = {}) {
  if (!form.contactName || !String(form.contactName).trim()) {
    return { ok: false, message: '请填写联系人称呼', field: 'contactName' }
  }
  if (!form.platformConsent) {
    return { ok: false, message: '请先确认咨询转接说明', field: 'platformConsent' }
  }
  if (opts.isAccident && !form.accidentConsent) {
    return {
      ok: false,
      message: '请先确认已知晓事故车检测报价规则',
      field: 'accidentConsent',
    }
  }
  return { ok: true }
}

function formatAppointmentLabel(appointment) {
  if (!appointment) return ''
  const { dateLabel, slot } = appointment
  if (dateLabel && slot) return `${dateLabel} ${slot}`
  return dateLabel || slot || ''
}

module.exports = {
  getSubmitButtonLabel,
  getConsultPageTitle,
  validateLeadForm,
  formatAppointmentLabel,
}
