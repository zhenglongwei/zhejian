/** 商家服务方案 — 咨询/预约说明（M-SVC-08，存 appointment_json） */

const DEFAULT_APPOINTMENT_JSON = {
  slotNote: '',
  advanceRequired: false,
  advanceNote: '',
  holidayNote: '',
  consultGuide: '',
}

function normalizeAppointmentJson(raw) {
  const src =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    slotNote: String(src.slotNote || '').trim(),
    advanceRequired: Boolean(src.advanceRequired),
    advanceNote: String(src.advanceNote || '').trim(),
    holidayNote: String(src.holidayNote || '').trim(),
    consultGuide: String(src.consultGuide || '').trim(),
  }
}

function appointmentJsonFromForm(form = {}) {
  const normalized = normalizeAppointmentJson({
    slotNote: form.slotNote,
    advanceRequired: form.advanceRequired,
    advanceNote: form.advanceNote,
    holidayNote: form.holidayNote,
    consultGuide: form.consultGuide,
  })
  if (normalized.advanceRequired && !normalized.advanceNote) {
    normalized.advanceNote = '请提前预约后再到店'
  }
  return normalized
}

function appointmentFormFromJson(raw, acceptAppointment = true) {
  const json = normalizeAppointmentJson(raw)
  return {
    acceptConsult: acceptAppointment !== false,
    slotNote: json.slotNote,
    advanceRequired: json.advanceRequired,
    advanceNote: json.advanceNote,
    holidayNote: json.holidayNote,
    consultGuide: json.consultGuide,
  }
}

function buildAppointmentSection(record = {}) {
  const accept = record.acceptAppointment !== false
  const json = normalizeAppointmentJson(record.appointmentJson)
  const rows = []

  if (!accept) {
    rows.push({ label: '咨询/预约', value: '当前暂不接受线上咨询/预约' })
    return { hasContent: true, rows, consultGuide: '' }
  }

  if (json.slotNote) {
    rows.push({ label: '可预约时段', value: json.slotNote })
  }
  if (json.advanceRequired) {
    rows.push({
      label: '提前预约',
      value: json.advanceNote || '需提前预约后再到店',
    })
  }
  if (json.holidayNote) {
    rows.push({ label: '节假日说明', value: json.holidayNote })
  }

  const hasContent = rows.length > 0 || Boolean(json.consultGuide)
  return {
    hasContent,
    rows,
    consultGuide: json.consultGuide,
  }
}

module.exports = {
  DEFAULT_APPOINTMENT_JSON,
  normalizeAppointmentJson,
  appointmentJsonFromForm,
  appointmentFormFromJson,
  buildAppointmentSection,
}
