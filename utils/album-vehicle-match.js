/**
 * 用户车辆 ↔ 服务相册 vehicleJson 匹配 — B-ALB-09
 * 口径：品牌+车系一致；双方均有车牌时车牌须一致（脱敏后比对）。
 */

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizePlate(value) {
  return String(value || '')
    .trim()
    .replace(/[\s·.]/g, '')
    .toUpperCase()
}

function toVehicleProfile(input = {}) {
  if (!input || typeof input !== 'object') return null
  return {
    brand: input.brand || '',
    series: input.series || '',
    modelYear: input.modelYear || input.model_year || '',
    plateDisplay: input.plateDisplay || input.plate || '',
  }
}

function albumMatchesUserVehicle(albumVehicle, userVehicle) {
  const album = toVehicleProfile(albumVehicle)
  const user = toVehicleProfile(userVehicle)
  if (!album || !user) return false

  const brand = normalizeText(album.brand)
  const series = normalizeText(album.series)
  const uBrand = normalizeText(user.brand)
  const uSeries = normalizeText(user.series)
  if (!brand || !series || !uBrand || !uSeries) return false
  if (brand !== uBrand || series !== uSeries) return false

  const plate = normalizePlate(album.plateDisplay)
  const uPlate = normalizePlate(user.plateDisplay)
  if (plate && uPlate && plate !== uPlate) return false
  return true
}

module.exports = {
  normalizeText,
  normalizePlate,
  toVehicleProfile,
  albumMatchesUserVehicle,
}
