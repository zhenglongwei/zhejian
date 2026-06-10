/**
 * DS-D-08 · 工具型搜索（相册码 / 本店范围）
 */
const ALBUM_ID_PATTERN = /^alb_[a-zA-Z0-9_]+$/

function isAlbumCodeInput(value) {
  return ALBUM_ID_PATTERN.test(String(value || '').trim())
}

function applyStoreScopeToSearchResult(result, storeId) {
  if (!result) return result
  const sid = String(storeId || '').trim()
  if (!sid) {
    return {
      ...result,
      geoPages: [],
      services: [],
      merchants: [],
      cases: [],
      hotwords: [],
      counts: { service: 0, merchant: 0, case: 0, geo: 0 },
    }
  }

  const services = (result.services || []).filter((item) => item && item.storeId === sid)
  const merchants = (result.merchants || []).filter((item) => item && item.id === sid)
  const cases = (result.cases || []).filter((item) => item && item.storeId === sid)

  return {
    ...result,
    geoPages: [],
    hotwords: [],
    services,
    merchants,
    cases,
    counts: {
      service: services.length,
      merchant: merchants.length,
      case: cases.length,
      geo: 0,
    },
  }
}

module.exports = {
  ALBUM_ID_PATTERN,
  isAlbumCodeInput,
  applyStoreScopeToSearchResult,
}
