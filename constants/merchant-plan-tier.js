/**
 * 商家 SaaS 方案档位 · 工作台店名旁文案
 * 真源：docs/03_商家端/05_商家套餐与权益.md
 */

const MERCHANT_PLAN_TIER = {
  BASIC: 'basic',
  STANDARD: 'standard',
}

const MERCHANT_PLAN_LABELS = {
  taste: '尝鲜版',
  micro: '小微店',
  standard: '标准店',
  scale: '规模店',
  free: '尝鲜版',
  index_99: '尝鲜版',
  optimize_299: '尝鲜版',
}

const MERCHANT_PLAN_TIER_BY_PLAN = {
  taste: MERCHANT_PLAN_TIER.BASIC,
  micro: MERCHANT_PLAN_TIER.BASIC,
  standard: MERCHANT_PLAN_TIER.STANDARD,
  scale: MERCHANT_PLAN_TIER.STANDARD,
  free: MERCHANT_PLAN_TIER.BASIC,
  index_99: MERCHANT_PLAN_TIER.BASIC,
  optimize_299: MERCHANT_PLAN_TIER.BASIC,
}

const MERCHANT_PLAN_TIER_LABELS = {
  [MERCHANT_PLAN_TIER.BASIC]: '尝鲜版',
  [MERCHANT_PLAN_TIER.STANDARD]: '标准店',
}

function resolveMerchantPlanTier(plan) {
  const tier = MERCHANT_PLAN_TIER_BY_PLAN[plan] || MERCHANT_PLAN_TIER.BASIC
  return {
    tier,
    text: MERCHANT_PLAN_LABELS[plan] || MERCHANT_PLAN_TIER_LABELS[tier] || '尝鲜版',
    canUpgrade: false,
  }
}

/**
 * 店名旁文案：额度满 > 到期前3天 > 套餐名
 */
function buildMerchantPricingCue(panel = {}, isOwner = false) {
  if (!isOwner) return null
  const cue = panel && panel.pricingCue
  if (cue && cue.text) {
    return {
      text: cue.text,
      kind: cue.kind || 'plan',
      daysLeft: cue.daysLeft,
    }
  }
  const sub = (panel && panel.subscription) || panel || {}
  const usedAi =
    Number(
      sub.usedAiQuota != null
        ? sub.usedAiQuota
        : panel.usedAiQuota != null
          ? panel.usedAiQuota
          : sub.usedQuota != null
            ? sub.usedQuota
            : panel.usedQuota,
    ) || 0
  const aiLimit =
    Number(
      sub.aiQuotaLimit != null
        ? sub.aiQuotaLimit
        : panel.aiQuotaLimit != null
          ? panel.aiQuotaLimit
          : sub.quotaLimit != null
            ? sub.quotaLimit
            : panel.quotaLimit,
    ) || 3
  if (usedAi >= aiLimit) {
    return { text: 'AI额度已满，去升级', kind: 'ai_quota_full' }
  }
  const usedHost =
    Number(
      sub.usedPublicHostQuota != null
        ? sub.usedPublicHostQuota
        : panel.usedPublicHostQuota,
    ) || 0
  const hostLimit =
    Number(
      sub.publicHostQuotaLimit != null
        ? sub.publicHostQuotaLimit
        : panel.publicHostQuotaLimit,
    ) || 3
  if (usedHost >= hostLimit) {
    return { text: '托管额度已满，去升级', kind: 'host_quota_full' }
  }
  const daysLeft =
    sub.daysLeft != null
      ? Number(sub.daysLeft)
      : panel.planStatus && panel.planStatus.daysLeft != null
        ? Number(panel.planStatus.daysLeft)
        : null
  if (daysLeft !== null && !Number.isNaN(daysLeft) && daysLeft >= 0 && daysLeft <= 3) {
    return {
      text: daysLeft <= 0 ? '今日到期，去续费' : `还剩 ${daysLeft} 天到期，去续费`,
      kind: 'expiring',
      daysLeft,
    }
  }
  const label =
    sub.effectivePlanLabel ||
    MERCHANT_PLAN_LABELS[sub.effectivePlan] ||
    MERCHANT_PLAN_LABELS[sub.plan] ||
    '尝鲜版'
  return { text: label, kind: 'plan' }
}

/** @deprecated 用 buildMerchantPricingCue */
function buildMerchantPlanTag(subscription = {}, isOwner = false) {
  if (!isOwner) return null
  const cue = buildMerchantPricingCue({ subscription }, isOwner)
  return cue
    ? { tier: MERCHANT_PLAN_TIER.BASIC, text: cue.text, canUpgrade: cue.kind === 'quota_full' }
    : null
}

function isActiveTrialPeriod() {
  return false
}

module.exports = {
  MERCHANT_PLAN_TIER,
  MERCHANT_PLAN_TIER_BY_PLAN,
  MERCHANT_PLAN_TIER_LABELS,
  MERCHANT_PLAN_LABELS,
  resolveMerchantPlanTier,
  buildMerchantPlanTag,
  buildMerchantPricingCue,
  isActiveTrialPeriod,
}
