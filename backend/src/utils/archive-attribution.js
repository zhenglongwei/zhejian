/**
 * 案例档案归属（15_ §7.2 / §7.3）
 * 未认领不得写成该店案例；门店身份 / 已认领才可作为作者。
 */

const ATTRIBUTION_STATUS = {
  STORE_PUBLISHED: 'store_published',
  STORE_CLAIMED: 'store_claimed',
  CLAIMED_UNCONFIRMED: 'claimed_unconfirmed',
}

function readHostMeta(source) {
  if (!source || typeof source !== 'object') return {}
  if (source.hostMeta && typeof source.hostMeta === 'object') return source.hostMeta
  const pkg = source.contentPackageJson
  if (pkg && typeof pkg === 'object' && pkg.hostMeta && typeof pkg.hostMeta === 'object') {
    return pkg.hostMeta
  }
  return {}
}

function inferAttributionStatus({ hostMeta, authorizationTier } = {}) {
  const raw = String((hostMeta && hostMeta.attributionStatus) || '').trim()
  if (raw === ATTRIBUTION_STATUS.CLAIMED_UNCONFIRMED) return raw
  if (raw === ATTRIBUTION_STATUS.STORE_CLAIMED) return raw
  if (raw === ATTRIBUTION_STATUS.STORE_PUBLISHED) return raw
  if (authorizationTier === 'anonymous') return ATTRIBUTION_STATUS.CLAIMED_UNCONFIRMED
  return ATTRIBUTION_STATUS.STORE_PUBLISHED
}

function factHeadline({ vehicleText, serviceName } = {}) {
  const vehicle = String(vehicleText || '').trim()
  const service = String(serviceName || '').trim()
  if (vehicle && service) return `${vehicle}${service}`
  if (vehicle) return `${vehicle}维修`
  if (service) return service
  return '维修案例'
}

/**
 * @param {object} input
 * @returns {object} attribution 给公开页 / JSON-LD
 */
function buildArchiveAttribution(input = {}) {
  const hostMeta = input.hostMeta && typeof input.hostMeta === 'object' ? input.hostMeta : {}
  const status = inferAttributionStatus({
    hostMeta,
    authorizationTier: input.authorizationTier,
  })
  const storeName = String(input.storeName || hostMeta.claimedStoreName || '').trim()
  const vehicleText = String(input.vehicleText || '').trim()
  const serviceName = String(input.serviceName || '').trim()
  const unconfirmed = status === ATTRIBUTION_STATUS.CLAIMED_UNCONFIRMED
  const showStoreAsAuthor = !unconfirmed && Boolean(storeName)

  let sourceLabel = '商家上传'
  let storeAttributionLabel = storeName ? `${storeName}发布` : '商家上传'
  if (status === ATTRIBUTION_STATUS.STORE_CLAIMED) {
    sourceLabel = '商家上传'
    storeAttributionLabel = storeName ? `${storeName}（已认领）` : '门店已认领'
  }
  if (unconfirmed) {
    sourceLabel = '提交者声称'
    storeAttributionLabel = storeName
      ? `提交者声称：${storeName}（门店未确认）`
      : '门店未确认'
  }

  return {
    status,
    showStoreAsAuthor,
    sourceLabel,
    storeAttributionLabel,
    claimedStoreName: unconfirmed ? storeName : '',
    schemaStoreAttributionStatus: unconfirmed ? 'claimed' : 'store_published',
    factHeadline: factHeadline({ vehicleText, serviceName }),
  }
}

function isStoreShowcaseCase(attribution) {
  const status = attribution && attribution.status
  return (
    status === ATTRIBUTION_STATUS.STORE_PUBLISHED || status === ATTRIBUTION_STATUS.STORE_CLAIMED
  )
}

function attachArchiveAttribution(item, extra = {}) {
  if (!item) return item
  const hostMeta = extra.hostMeta || readHostMeta(extra.album) || readHostMeta(item)
  const attribution = buildArchiveAttribution({
    hostMeta,
    authorizationTier: item.authorizationTier,
    storeName: item.storeName,
    vehicleText: item.vehicleText,
    serviceName: item.serviceName,
  })
  const next = { ...item, attribution }
  if (!attribution.showStoreAsAuthor) {
    next.seoTitle = attribution.factHeadline
    if (next.seo && typeof next.seo === 'object') {
      next.seo = { ...next.seo, title: attribution.factHeadline }
    }
  }
  return next
}

module.exports = {
  ATTRIBUTION_STATUS,
  readHostMeta,
  inferAttributionStatus,
  factHeadline,
  buildArchiveAttribution,
  isStoreShowcaseCase,
  attachArchiveAttribution,
}
