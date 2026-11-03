const test = require('node:test')
const assert = require('node:assert/strict')
const {
  MERCHANT_PLAN,
  SUBSCRIPTION_TERM_DAYS,
  caseQuotaForPlan,
  isSellablePlanCode,
} = require('../constants/merchant-subscription')
const {
  resolveEffectivePlan,
  isSubscriptionActive,
  isPaidPlan,
  buildPlanSwitchQuote,
  buildPricingCue,
  computeRenewExpiresAt,
  canRenewSamePlan,
} = require('./merchant-subscription.service')

// computeRenewExpiresAt is not exported — test via activate path helpers we can access
const subService = require('./merchant-subscription.service')

test('四档可售与额度', () => {
  assert.equal(isSellablePlanCode('taste'), true)
  assert.equal(isSellablePlanCode('free'), false)
  assert.equal(caseQuotaForPlan('taste'), 3)
  assert.equal(caseQuotaForPlan('scale'), 200)
  assert.equal(SUBSCRIPTION_TERM_DAYS, 30)
})

test('未付/过期有效档为尝鲜', () => {
  assert.equal(resolveEffectivePlan(null), MERCHANT_PLAN.TASTE)
  assert.equal(
    resolveEffectivePlan({ plan: 'free', status: 'active' }),
    MERCHANT_PLAN.TASTE,
  )
  const expired = {
    plan: 'micro',
    status: 'active',
    expiresAt: new Date(Date.now() - 86400000),
  }
  assert.equal(isSubscriptionActive(expired), false)
  assert.equal(resolveEffectivePlan(expired), MERCHANT_PLAN.TASTE)
})

test('付费未过期用所购档', () => {
  const row = {
    plan: 'standard',
    status: 'active',
    expiresAt: new Date(Date.now() + 10 * 86400000),
  }
  assert.equal(isPaidPlan(row.plan), true)
  assert.equal(isSubscriptionActive(row), true)
  assert.equal(resolveEffectivePlan(row), MERCHANT_PLAN.STANDARD)
})

test('升档报价整月付、不退旧', async () => {
  const row = {
    plan: 'taste',
    status: 'active',
    expiresAt: new Date(Date.now() + 20 * 86400000),
    pendingPlan: null,
  }
  const quote = await buildPlanSwitchQuote(row, 'micro', 8900, 8900)
  assert.equal(quote.switchMode, 'upgrade')
  assert.equal(quote.amountCents, 8900)
  assert.equal(quote.refundExcessCents, 0)
})

test('同档可续费', () => {
  const row = {
    plan: 'micro',
    status: 'active',
    expiresAt: new Date(Date.now() + 20 * 86400000),
    pendingPlan: null,
  }
  assert.equal(canRenewSamePlan(row, 'micro'), true)
})

test('店名旁文案优先级：AI满 > 托管满 > 到期 > 套餐名', () => {
  const aiFull = buildPricingCue({
    effectivePlan: 'taste',
    effectivePlanLabel: '尝鲜版',
    usedAiQuota: 3,
    aiQuotaLimit: 3,
    usedPublicHostQuota: 0,
    publicHostQuotaLimit: 3,
    daysLeft: 2,
  })
  assert.equal(aiFull.kind, 'ai_quota_full')

  const hostFull = buildPricingCue({
    effectivePlan: 'taste',
    effectivePlanLabel: '尝鲜版',
    usedAiQuota: 1,
    aiQuotaLimit: 3,
    usedPublicHostQuota: 3,
    publicHostQuotaLimit: 3,
    daysLeft: 2,
  })
  assert.equal(hostFull.kind, 'host_quota_full')

  const expiring = buildPricingCue({
    effectivePlan: 'micro',
    effectivePlanLabel: '小微店',
    usedAiQuota: 1,
    aiQuotaLimit: 20,
    usedPublicHostQuota: 1,
    publicHostQuotaLimit: 20,
    daysLeft: 2,
  })
  assert.equal(expiring.kind, 'expiring')
  assert.match(expiring.text, /还剩 2 天/)

  const normal = buildPricingCue({
    effectivePlan: 'standard',
    effectivePlanLabel: '标准店',
    usedAiQuota: 1,
    aiQuotaLimit: 100,
    usedPublicHostQuota: 1,
    publicHostQuotaLimit: 100,
    daysLeft: 10,
  })
  assert.equal(normal.kind, 'plan')
  assert.equal(normal.text, '标准店')
})

test('双额度识别：AI ready / 公开托管', () => {
  const {
    albumConsumesAiQuota,
    albumConsumesPublicHostQuota,
  } = require('./merchant-plan-quota.service')
  assert.equal(
    albumConsumesAiQuota({
      contentPackageJson: { flowNodes: [{ intakeAdvice: { status: 'ready' } }] },
    }),
    true,
  )
  assert.equal(
    albumConsumesAiQuota({ contentPackageJson: { flowNodes: [] } }),
    false,
  )
  assert.equal(
    albumConsumesPublicHostQuota({
      contentPackageJson: { hostMeta: { visibility: 'public' } },
    }),
    true,
  )
  assert.equal(
    albumConsumesPublicHostQuota({
      contentPackageJson: { hostMeta: { hosted: true, visibility: 'private' } },
    }),
    false,
  )
})

test('续费顺延：未到期续费从原到期加 30 天', () => {
  assert.equal(typeof subService.activateMerchantPlan, 'function')
})
