/**
 * 商家 SaaS 方案档位 · 扉页 Tag / PlanTierBadge
 * 命名 intentionally 不绑定具体权益，仅表示方案层级。
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
  [MERCHANT_PLAN_TIER.BASIC]: '试用期',
  [MERCHANT_PLAN_TIER.STANDARD]: '标准版',
}

function resolveMerchantPlanTier(plan) {
  const tier = MERCHANT_PLAN_TIER_BY_PLAN[plan] || MERCHANT_PLAN_TIER.BASIC
  return {
    tier,
    text: MERCHANT_PLAN_TIER_LABELS[tier] || MERCHANT_PLAN_TIER_LABELS[MERCHANT_PLAN_TIER.BASIC],
    canUpgrade: tier !== MERCHANT_PLAN_TIER.STANDARD,
  }
}

function buildMerchantPlanTag(subscription = {}, isOwner = false) {
  if (!isOwner || !subscription || typeof subscription !== 'object') return null
  const plan = subscription.plan || 'free'
  return resolveMerchantPlanTier(plan)
}

module.exports = {
  MERCHANT_PLAN_TIER,
  MERCHANT_PLAN_TIER_BY_PLAN,
  MERCHANT_PLAN_TIER_LABELS,
  resolveMerchantPlanTier,
  buildMerchantPlanTag,
}
