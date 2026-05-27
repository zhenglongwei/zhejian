const { randomBytes } = require('crypto')

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`
}

function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone || ''
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

function formatVehicle(vehicleJson) {
  if (!vehicleJson || typeof vehicleJson !== 'object') return '—'
  const brand = vehicleJson.brand || ''
  const series = vehicleJson.series || ''
  const plate = vehicleJson.plateDisplay || ''
  const model = [brand, series].filter(Boolean).join(' ')
  if (model && plate) return `${model} / ${plate}`
  return model || plate || '—'
}

function toIso(value) {
  if (!value) return ''
  return value instanceof Date ? value.toISOString() : String(value)
}

module.exports = {
  newId,
  maskPhone,
  formatVehicle,
  toIso,
}
