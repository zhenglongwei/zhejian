/**
 * 商家 SaaS 方案档位 · 扉页 Tag / PlanTierBadge
 * 当前全功能免费；旧 plan 码仅兼容映射。
 */

const MERCHANT_PLAN_TIER = {
  BASIC: 'basic',
  STANDARD: 'standard',
}

const MERCHANT_PLAN_TIER_BY_PLAN = {
  free: MERCHANT_PLAN_TIER.BASIC,
  tool_480: MERCHANT_PLAN_TIER.STANDARD,
  index_99: MERCHANT_PLAN_TIER.STANDARD,
  optimize_299: MERCHANT_PLAN_TIER.STANDARD,
}

const MERCHANT_PLAN_TIER_LABELS = {
  [MERCHANT_PLAN_TIER.BASIC]: '免费使用',
  [MERCHANT_PLAN_TIER.STANDARD]: '免费使用',
}

function resolveMerchantPlanTier(plan) {
  const tier = MERCHANT_PLAN_TIER_BY_PLAN[plan] || MERCHANT_PLAN_TIER.BASIC
  return {
    tier,
    text: MERCHANT_PLAN_TIER_LABELS[tier] || '免费使用',
    canUpgrade: false,
  }
}

function buildMerchantPlanTag(subscription = {}, isOwner = false) {
  if (!isOwner || !subscription || typeof subscription !== 'object') return null
  return {
    tier: MERCHANT_PLAN_TIER.BASIC,
    text: '免费使用',
    canUpgrade: false,
  }
}

function isActiveTrialPeriod() {
  return false
}

module.exports = {
  MERCHANT_PLAN_TIER,
  MERCHANT_PLAN_TIER_BY_PLAN,
  MERCHANT_PLAN_TIER_LABELS,
  resolveMerchantPlanTier,
  buildMerchantPlanTag,
  isActiveTrialPeriod,
}
