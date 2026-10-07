function maskPlate(plate) {
  if (!plate || !String(plate).trim()) return ''
  const raw = String(plate).trim()
  if (raw.length <= 4) return raw
  if (raw.length >= 7) {
    return `${raw.slice(0, 2)}****${raw.slice(-1)}`
  }
  return `${raw.slice(0, 1)}****${raw.slice(-1)}`
}

function looksMaskedPlate(plate) {
  return /\*{2,}/.test(String(plate || ''))
}

/** 关联车主看自己的相册：完整车牌；没有明文时才回落已脱敏展示 */
function ownerVisiblePlate(vehicle = {}) {
  const full = String(vehicle.plate || vehicle.plateNumber || '').trim()
  if (full && !looksMaskedPlate(full)) return full
  const display = String(vehicle.plateDisplay || '').trim()
  if (display && !looksMaskedPlate(display)) return display
  return full || display || ''
}

module.exports = { maskPlate, looksMaskedPlate, ownerVisiblePlate }
