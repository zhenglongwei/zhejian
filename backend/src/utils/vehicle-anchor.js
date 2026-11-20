/**
 * 车型锚点：给节点 AI 用的车辆摘要。
 * 以相册登记的 vehicleJson 为准（VIN 解析会带排量、发动机、变速箱），单据里的车辆字段只补空。
 * 车牌、VIN、车架号属打码对象，任何提示词都不带。
 */
function str(value) {
  return String(value == null ? '' : value).trim()
}

function mileageText(value) {
  const digits = str(value).replace(/[^\d.]/g, '')
  return digits ? `${digits}km` : ''
}

/**
 * @param {object} vehicleJson album.vehicleJson（normalizeVehicleJson 之后的形态，也容忍原始字段名）
 * @param {object} fallback 单据/事实包里的车辆信息，只用于补空
 * @returns {object|null} 认不出品牌与车系时返回 null，调用方整块不送
 */
function vehicleAnchor(vehicleJson, fallback = {}) {
  const raw = vehicleJson && typeof vehicleJson === 'object' ? vehicleJson : {}
  const picked = fallback && typeof fallback === 'object' ? fallback : {}
  const row = {
    brand: str(raw.brand || picked.brand),
    series: str(raw.series || picked.series),
    year: str(raw.modelYear || raw.model_year || picked.year),
    modelName: str(raw.modelName),
    displacement: str(raw.displacement),
    engine: str(raw.engineModel || raw.engine),
    gearbox: str(raw.gearbox || raw.transmission),
    mileage: mileageText(raw.mileage ?? raw.odometer) || str(picked.mileageText),
  }
  if (!row.brand && !row.series) return null
  return Object.keys(row).reduce((acc, key) => {
    if (row[key]) acc[key] = row[key]
    return acc
  }, {})
}

/** 提示词里的「车辆」一行，键序固定；认不出车时返回 null，调用方整块不写 */
function vehiclePromptRow(anchor) {
  if (!anchor) return null
  return {
    品牌: anchor.brand || '',
    车系: anchor.series || '',
    年款: anchor.year || '',
    完整车型: anchor.modelName || '',
    排量: anchor.displacement || '',
    发动机: anchor.engine || '',
    变速箱: anchor.gearbox || '',
    里程: anchor.mileage || '',
  }
}

module.exports = { vehicleAnchor, vehiclePromptRow }
