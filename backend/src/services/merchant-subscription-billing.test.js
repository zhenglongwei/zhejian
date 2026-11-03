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
  canRenewSamePlan,
  canGrantTasteTrial,
  buildTasteTrialPayload,
} = require('./merchant-subscription.service')
const {
  albumConsumesAiQuotaInPeriod,
  isTimestampInPeriod,
} = require('./merchant-plan-quota.service')

test('四档可售与额度', () => {
  assert.equal(isSellablePlanCode('taste'), true)
  assert.equal(isSellablePlanCode('free'), false)
  assert.equal(caseQuotaForPlan('taste'), 3)
  assert.equal(caseQuotaForPlan('scale'), 200)
  assert.equal(caseQuotaForPlan(null), 0)
  assert.equal(caseQuotaForPlan(''), 0)
  assert.equal(SUBSCRIPTION_TERM_DAYS, 30)
})

test('无周期/已过期无权益', () => {
  assert.equal(resolveEffectivePlan(null), null)
  assert.equal(
    resolveEffectivePlan({ plan: 'free', status: 'active' }),
    null,
  )
  const expired = {
    plan: 'micro',
    status: 'active',
    startedAt: new Date(Date.now() - 40 * 86400000),
    expiresAt: new Date(Date.now() - 86400000),
  }
  assert.equal(isSubscriptionActive(expired), false)
  assert.equal(resolveEffectivePlan(expired), null)
})

test('有效期内用所购档；赠送尝鲜也算有效', () => {
  const row = {
    plan: 'standard',
    status: 'active',
    startedAt: new Date(Date.now() - 5 * 86400000),
    expiresAt: new Date(Date.now() + 10 * 86400000),
  }
  assert.equal(isPaidPlan(row.plan), true)
  assert.equal(isSubscriptionActive(row), true)
  assert.equal(resolveEffectivePlan(row), MERCHANT_PLAN.STANDARD)

  const trial = buildTasteTrialPayload()
  assert.equal(resolveEffectivePlan(trial), MERCHANT_PLAN.TASTE)
  assert.equal(canGrantTasteTrial(trial), false)
  assert.equal(canGrantTasteTrial({ plan: 'free', status: 'active' }), true)
  assert.equal(
    canGrantTasteTrial({
      plan: 'taste',
      expiresAt: new Date(Date.now() - 86400000),
    }),
    false,
  )
})

test('升档报价整月付、不退旧', async () => {
  const row = {
    plan: 'taste',
    status: 'active',
    merchantId: 'm_test',
    startedAt: new Date(Date.now() - 5 * 86400000),
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
    startedAt: new Date(Date.now() - 5 * 86400000),
    expiresAt: new Date(Date.now() + 20 * 86400000),
    pendingPlan: null,
  }
  assert.equal(canRenewSamePlan(row, 'micro'), true)
})

test('到期后开通任意档为 purchase', async () => {
  const row = {
    plan: 'taste',
    status: 'expired',
    merchantId: 'm_test',
    startedAt: new Date(Date.now() - 40 * 86400000),
    expiresAt: new Date(Date.now() - 86400000),
    pendingPlan: null,
  }
  const taste = await buildPlanSwitchQuote(row, 'taste', 2900, 2900)
  assert.equal(taste.switchMode, 'purchase')
  const micro = await buildPlanSwitchQuote(row, 'micro', 8900, 8900)
  assert.equal(micro.switchMode, 'purchase')
})

test('店名旁文案：到期优先，其次额满，试用显示剩余天数', () => {
  const expired = buildPricingCue({
    effectivePlan: null,
    effectivePlanLabel: '已到期',
    usedAiQuota: 0,
    aiQuotaLimit: 0,
    usedPublicHostQuota: 0,
    publicHostQuotaLimit: 0,
    daysLeft: 0,
    entitlementActive: false,
  })
  assert.equal(expired.kind, 'expired')

  const aiFull = buildPricingCue({
    effectivePlan: 'taste',
    effectivePlanLabel: '尝鲜版',
    usedAiQuota: 3,
    aiQuotaLimit: 3,
    usedPublicHostQuota: 0,
    publicHostQuotaLimit: 3,
    daysLeft: 2,
    entitlementActive: true,
    isTasteTrial: true,
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
    entitlementActive: true,
    isTasteTrial: true,
  })
  assert.equal(hostFull.kind, 'host_quota_full')

  const trial = buildPricingCue({
    effectivePlan: 'taste',
    effectivePlanLabel: '尝鲜版',
    usedAiQuota: 0,
    aiQuotaLimit: 3,
    usedPublicHostQuota: 0,
    publicHostQuotaLimit: 3,
    daysLeft: 28,
    entitlementActive: true,
    isTasteTrial: true,
  })
  assert.equal(trial.kind, 'trial')
  assert.equal(trial.text, '尝鲜试用 · 还剩 28 天')

  const trialNearEnd = buildPricingCue({
    effectivePlan: 'taste',
    effectivePlanLabel: '尝鲜版',
    usedAiQuota: 0,
    aiQuotaLimit: 3,
    usedPublicHostQuota: 0,
    publicHostQuotaLimit: 3,
    daysLeft: 2,
    entitlementActive: true,
    isTasteTrial: true,
  })
  assert.equal(trialNearEnd.kind, 'expiring')
  assert.equal(trialNearEnd.text, '尝鲜试用 · 还剩 2 天')

  const expiring = buildPricingCue({
    effectivePlan: 'micro',
    effectivePlanLabel: '小微店',
    usedAiQuota: 1,
    aiQuotaLimit: 20,
    usedPublicHostQuota: 1,
    publicHostQuotaLimit: 20,
    daysLeft: 2,
    entitlementActive: true,
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
    entitlementActive: true,
  })
  assert.equal(normal.kind, 'plan')
  assert.equal(normal.text, '标准店')
})

test('周期内占用认时刻；跨期不占', () => {
  const start = new Date('2026-10-01T00:00:00.000Z')
  const end = new Date('2026-10-31T00:00:00.000Z')
  const period = { startedAt: start, expiresAt: end }
  assert.equal(
    isTimestampInPeriod('2026-10-15T12:00:00.000Z', start, end),
    true,
  )
  assert.equal(
    isTimestampInPeriod('2026-09-15T12:00:00.000Z', start, end),
    false,
  )

  const inPeriod = {
    contentPackageJson: {
      quotaMeta: { aiAnalysisConsumedAt: '2026-10-10T00:00:00.000Z' },
    },
  }
  const oldPeriod = {
    contentPackageJson: {
      quotaMeta: { aiAnalysisConsumedAt: '2026-09-01T00:00:00.000Z' },
    },
  }
  const legacyReady = {
    contentPackageJson: {
      flowNodes: [{ intakeAdvice: { status: 'ready' } }],
    },
  }
  assert.equal(albumConsumesAiQuotaInPeriod(inPeriod, period), true)
  assert.equal(albumConsumesAiQuotaInPeriod(oldPeriod, period), false)
  assert.equal(albumConsumesAiQuotaInPeriod(legacyReady, period), false)
})
