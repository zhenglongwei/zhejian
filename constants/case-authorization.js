/**
 * 公开案例授权档位 — Phase 1
 * @see docs/04_维修过程相册/00_Phase1_服务相册产品口径.md §4
 */
const PUBLIC_AUTH_TIER = {
  PRIVATE: 'private',
  ANONYMOUS: 'anonymous',
  NAMED: 'named',
}

const PUBLIC_AUTH_TIER_LABEL = {
  [PUBLIC_AUTH_TIER.PRIVATE]: '不公开',
  [PUBLIC_AUTH_TIER.ANONYMOUS]: '匿名授权',
  [PUBLIC_AUTH_TIER.NAMED]: '实名授权',
}

function normalizePublicAuthTier(tier) {
  if (
    tier === PUBLIC_AUTH_TIER.ANONYMOUS ||
    tier === PUBLIC_AUTH_TIER.NAMED ||
    tier === PUBLIC_AUTH_TIER.PRIVATE
  ) {
    return tier
  }
  return PUBLIC_AUTH_TIER.NAMED
}

/** 匿名公开档不在 UI 展示门店名称等品牌 identifiable 信息 */
function shouldShowStorePublicly(tier) {
  return normalizePublicAuthTier(tier) !== PUBLIC_AUTH_TIER.ANONYMOUS
}

module.exports = {
  PUBLIC_AUTH_TIER,
  PUBLIC_AUTH_TIER_LABEL,
  normalizePublicAuthTier,
  shouldShowStorePublicly,
}
