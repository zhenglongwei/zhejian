/**
 * 从门店地址取出城市名。
 * 「浙江省杭州市…」应得到「杭州市」，不能把省字切进城市。
 */

function extractCityFromAddress(address) {
  const raw = String(address || '').replace(/\s+/g, '')
  if (!raw) return ''
  if (raw.startsWith('省')) return extractCityFromAddress(raw.slice(1))

  const withProvince = raw.match(/([\u4e00-\u9fa5]{2,7})省([\u4e00-\u9fa5]{2,7}?)市/)
  if (withProvince) return `${withProvince[2]}市`

  const withRegion = raw.match(/自治区([\u4e00-\u9fa5]{2,7}?)市/)
  if (withRegion) return `${withRegion[1]}市`

  const head = raw.match(/^([\u4e00-\u9fa5]{2,7}?)市/)
  if (head) return `${head[1]}市`

  return ''
}

function normalizeCityLabel(city) {
  const value = String(city || '').trim().replace(/\s+/g, '')
  if (!value) return ''
  if (value.startsWith('省')) return normalizeCityLabel(value.slice(1))
  return value
}

function cityLabelFromStore(store) {
  const named = normalizeCityLabel(store && store.city)
  if (named) return named
  return extractCityFromAddress(store && (store.address || store.storeAddress))
}

module.exports = {
  extractCityFromAddress,
  normalizeCityLabel,
  cityLabelFromStore,
}
