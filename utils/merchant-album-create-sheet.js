function normalizeOwnerPhone(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizePlateInput(value) {
  return String(value || '')
    .trim()
    .replace(/[\s·.]/g, '')
    .toUpperCase()
}

function normalizeVinInput(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

function parseMileage(value) {
  const raw = String(value == null ? '' : value).trim()
  if (!raw) return null
  const mileage = Number(raw.replace(/[^\d.]/g, ''))
  if (!Number.isFinite(mileage) || mileage < 0) return null
  return Math.round(mileage)
}

function validateCreateSheet(form = {}) {
  const plate = normalizePlateInput(form.plate)
  if (!plate) return { ok: false, message: '请填写车牌' }

  const mileage = parseMileage(form.mileage)
  if (mileage == null) return { ok: false, message: '请填写当前里程' }

  const vin = normalizeVinInput(form.vin)
  if (vin && vin.length !== 17) return { ok: false, message: '车架号须为 17 位' }

  const vehicleBrand = String(form.vehicleBrand || '').trim()
  const vehicleSeries = String(form.vehicleSeries || '').trim()
  if (!vehicleBrand) return { ok: false, message: '请填写品牌' }
  if (!vehicleSeries) return { ok: false, message: '请填写车系' }

  const userPhone = normalizeOwnerPhone(form.userPhone)
  if (userPhone && userPhone.length !== 11) {
    return { ok: false, message: '请填写正确的手机号' }
  }

  return {
    ok: true,
    plate,
    mileage,
    vin,
    vehicleBrand,
    vehicleSeries,
    vehicleYear: String(form.vehicleYear || '').trim(),
    userPhone,
  }
}

module.exports = {
  normalizeOwnerPhone,
  normalizePlateInput,
  normalizeVinInput,
  parseMileage,
  validateCreateSheet,
}
