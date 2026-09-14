/**
 * 节点确认前检查 · 能力开关
 * 真源：docs/04_维修过程相册/28_节点AI检查_用户关心点与开发计划.md §4.4
 */
const {
  MERCHANT_PLAN,
  MERCHANT_SUBSCRIPTION_STATUS,
} = require('../constants/merchant-subscription')

function resolveNodeAiReviewCapability(subscription, settings = {}) {
  const enabled = settings.enabled !== false
  const requirePaid = settings.requirePaid === true
  const paidPlans = Array.isArray(settings.paidPlans) && settings.paidPlans.length
    ? settings.paidPlans.map((item) => String(item || '').trim()).filter(Boolean)
    : ['index_99', 'optimize_299']
  const llmEnabled = settings.llmEnabled === true

  if (!enabled) {
    return {
      enabled: false,
      entitled: false,
      llmEnabled: false,
      billing: 'off',
      reason: 'disabled',
    }
  }

  const sub = subscription || {}
  const active = !sub.status || sub.status === MERCHANT_SUBSCRIPTION_STATUS.ACTIVE
  const plan = String((active ? sub.plan : '') || MERCHANT_PLAN.FREE)

  if (!requirePaid) {
    return {
      enabled: true,
      entitled: true,
      llmEnabled,
      billing: 'free',
      reason: 'promo_free',
      plan,
    }
  }

  const entitled = Boolean(active && paidPlans.includes(plan))
  return {
    enabled: true,
    entitled,
    llmEnabled: entitled && llmEnabled,
    billing: 'paid',
    reason: entitled ? 'plan' : 'need_plan',
    plan,
  }
}

function publicNodeAiReviewCapability(capability) {
  const cap = capability || {}
  return {
    enabled: cap.enabled !== false,
    entitled: Boolean(cap.entitled),
  }
}

module.exports = {
  resolveNodeAiReviewCapability,
  publicNodeAiReviewCapability,
}
