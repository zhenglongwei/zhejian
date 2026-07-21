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
  [MERCHANT_PLAN_TIER.BASIC]: '未开通',
  [MERCHANT_PLAN_TIER.STANDARD]: '标准版',
}

const DAY_MS = 24 * 60 * 60 * 1000

function isActiveTrialPeriod(subscription = {}) {
  const plan = subscription.plan || 'free'
  if (!MERCHANT_PLAN_TIER_BY_PLAN[plan] || MERCHANT_PLAN_TIER_BY_PLAN[plan] !== MERCHANT_PLAN_TIER.STANDARD) {
    return false
  }
  if (!subscription.standardTrialUsed || !subscription.expiresAt) return false
  const end = new Date(subscription.expiresAt).getTime()
  if (!(end > Date.now())) return false
  const start = subscription.startedAt
    ? new Date(subscription.startedAt).getTime()
    : NaN
  if (Number.isFinite(start) && start > 0) {
    return Math.ceil((end - start) / DAY_MS) <= 100
  }
  return Math.ceil((end - Date.now()) / DAY_MS) <= 95
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
  if (isActiveTrialPeriod(subscription)) {
    return {
      tier: MERCHANT_PLAN_TIER.STANDARD,
      text: '试用中',
      canUpgrade: false,
    }
  }
  return resolveMerchantPlanTier(plan)
}

module.exports = {
  MERCHANT_PLAN_TIER,
  MERCHANT_PLAN_TIER_BY_PLAN,
  MERCHANT_PLAN_TIER_LABELS,
  resolveMerchantPlanTier,
  buildMerchantPlanTag,
  isActiveTrialPeriod,
}
