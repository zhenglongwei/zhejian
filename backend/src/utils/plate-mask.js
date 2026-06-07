function maskPlate(plate) {
  if (!plate || !String(plate).trim()) return ''
  const raw = String(plate).trim()
  if (raw.length <= 4) return raw
  if (raw.length >= 7) {
    return `${raw.slice(0, 2)}****${raw.slice(-1)}`
  }
  return `${raw.slice(0, 1)}****${raw.slice(-1)}`
}

module.exports = { maskPlate }
