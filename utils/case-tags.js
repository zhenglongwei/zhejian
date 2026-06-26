const {
  PUBLIC_AUTH_TIER,
  normalizePublicAuthTier,
} = require('../constants/case-authorization')

const MAX_TAGS = 3

/**
 * 公开案例标准标签行（Phase 1：匿名/实名授权 · 已脱敏 · 已审核）
 */
function buildCaseTags(authorizationTier) {
  const tier = normalizePublicAuthTier(authorizationTier)
  const authTag =
    tier === PUBLIC_AUTH_TIER.ANONYMOUS
      ? { variant: 'desensitized', text: '匿名授权' }
      : tier === PUBLIC_AUTH_TIER.NAMED
        ? { variant: 'order', text: '实名授权' }
        : { variant: 'order', text: '已授权' }

  return [
    authTag,
    { variant: 'desensitized', text: '已脱敏' },
    { variant: 'audited', text: '已审核' },
  ].slice(0, MAX_TAGS)
}

/** 门店页列表：仅展示合规状态，减少彩色 Tag */
function buildCaseTrustTags() {
  return [
    { variant: 'default', text: '已脱敏' },
    { variant: 'default', text: '已审核' },
  ]
}

module.exports = { buildCaseTags, buildCaseTrustTags }
