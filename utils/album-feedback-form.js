const {
  ALBUM_FEEDBACK_TYPE_OPTIONS,
  ALBUM_FEEDBACK_CONSENT_TEXT,
  ALBUM_FEEDBACK_SUCCESS_MESSAGE,
} = require('../constants/album-feedback')

function validateAlbumFeedbackForm(form) {
  if (!form.feedbackType) {
    return { ok: false, message: '请选择反馈类型' }
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
    return { ok: false, message: '请先阅读并勾选反馈声明' }
  }
  return { ok: true }
}

module.exports = {
  ALBUM_FEEDBACK_TYPE_OPTIONS,
  ALBUM_FEEDBACK_CONSENT_TEXT,
  ALBUM_FEEDBACK_SUCCESS_MESSAGE,
  validateAlbumFeedbackForm,
}
