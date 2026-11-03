/**
 * 商家 SaaS 套餐 · 公域收录 gate（方案 B：生成 H5 但 noindex + 不进 sitemap）
 */
const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')
const { config } = require('../config')
const { resolveSeoNoindex } = require('../utils/case-article-templates')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const {
  MERCHANT_PLAN,
  MERCHANT_PLAN_LABELS,
  MERCHANT_PLAN_TAG_LABELS,
  MERCHANT_PLAN_TAG_TIERS,
  MERCHANT_PLAN_PRICE_CENTS,
  MERCHANT_SUBSCRIPTION_STATUS,
  MERCHANT_PAYMENT_STATUS,
  PUBLIC_INDEX_PLANS,
  PAID_PLANS,
  SELLABLE_PLANS,
  PLAN_RANK,
  SUBSCRIPTION_TERM_DAYS,
  STANDARD_TRIAL_DAYS,
  RENEWAL_NOTICE_DAYS,
  PLAN_CATALOG,
  caseQuotaForPlan,
  isSellablePlanCode,
} = require('../constants/merchant-subscription')
const { assertPrismaDelegate } = require('../lib/prisma')

const SUBSCRIPTION_SETUP_HINT =
  'merchant_subscriptions 未就绪：请在 backend 执行 npm run db:setup:prod 后 pm2 restart zhejian-api'

function compareMerchantPlans(fromPlan, toPlan) {
  return (PLAN_RANK[fromPlan] ?? 0) - (PLAN_RANK[toPlan] ?? 0)
}

function isPlanUpgrade(fromPlan, toPlan) {
  return compareMerchantPlans(fromPlan, toPlan) < 0
}

function isPlanDowngrade(fromPlan, toPlan) {
  return compareMerchantPlans(fromPlan, toPlan) > 0
}

function isPaidPlan(plan) {
  return PAID_PLANS.has(String(plan || ''))
}

function subscriptionRepo() {
  return prisma.merchantSubscription || null
}

function assertSubscriptionPrismaReady() {
  assertPrismaDelegate('merchantSubscription', 'merchant_subscriptions')
}

function isSubscriptionActive(row) {
  if (!row) return false
  if (row.status !== MERCHANT_SUBSCRIPTION_STATUS.ACTIVE) return false
  if (!isPaidPlan(row.plan)) return true
  if (!row.expiresAt) return false
  return row.expiresAt.getTime() > Date.now()
}

/** 有效权益档：付费未过期用所购档，否则尝鲜版 */
function resolveEffectivePlan(row) {
  if (row && isPaidPlan(row.plan) && isSubscriptionActive(row)) {
    return row.plan
  }
  return MERCHANT_PLAN.TASTE
}

function hasPublicIndexEntitlement(row) {
  // 未付/过期也按尝鲜权益，仍可基础收录
  return Boolean(row)
}

function formatSubscriptionRow(row) {
  if (!row) {
    return {
      plan: MERCHANT_PLAN.FREE,
      effectivePlan: MERCHANT_PLAN.TASTE,
      planLabel: MERCHANT_PLAN_LABELS[MERCHANT_PLAN.TASTE],
      effectivePlanLabel: MERCHANT_PLAN_LABELS[MERCHANT_PLAN.TASTE],
      status: MERCHANT_SUBSCRIPTION_STATUS.ACTIVE,
      publicIndex: true,
      expiresAt: null,
      founderFlag: false,
      founderRenewDiscount: null,
      indexingSlaDeadline: null,
      indexingSlaMet: false,
      standardTrialUsed: false,
      quotaLimit: caseQuotaForPlan(MERCHANT_PLAN.TASTE),
    }
  }
  const active = isSubscriptionActive(row)
  const effectivePlan = resolveEffectivePlan(row)
  const publicIndex = hasPublicIndexEntitlement(row)
  return {
    plan: row.plan || MERCHANT_PLAN.FREE,
    effectivePlan,
    planLabel:
      MERCHANT_PLAN_LABELS[row.plan] || MERCHANT_PLAN_LABELS[MERCHANT_PLAN.TASTE],
    effectivePlanLabel: MERCHANT_PLAN_LABELS[effectivePlan],
    status: active
      ? row.status
      : isPaidPlan(row.plan)
        ? MERCHANT_SUBSCRIPTION_STATUS.EXPIRED
        : MERCHANT_SUBSCRIPTION_STATUS.ACTIVE,
    publicIndex,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    founderFlag: Boolean(row.founderFlag),
    founderRenewDiscount: row.founderRenewDiscount,
    indexingSlaDeadline: row.indexingSlaDeadline
      ? row.indexingSlaDeadline.toISOString()
      : null,
    indexingSlaMet: Boolean(row.indexingSlaMet),
    pendingPlan: row.pendingPlan || null,
    pendingPlanLabel: row.pendingPlan
      ? MERCHANT_PLAN_TAG_LABELS[row.pendingPlan] ||
        MERCHANT_PLAN_TAG_LABELS[MERCHANT_PLAN.TASTE]
      : null,
    pendingEffectiveAt: row.pendingPlan && row.expiresAt ? row.expiresAt.toISOString() : null,
    standardTrialUsed: Boolean(row.standardTrialUsed),
    quotaLimit: caseQuotaForPlan(effectivePlan),
  }
}

async function applyPendingPlanIfExpired(row) {
  if (!row?.pendingPlan || !row.expiresAt) return row
  if (row.expiresAt.getTime() > Date.now()) return row

  const plan = row.pendingPlan
  const now = new Date()
  const data = {
    plan,
    pendingPlan: null,
    startedAt: now,
    status: MERCHANT_SUBSCRIPTION_STATUS.EXPIRED,
    expiresAt: row.expiresAt,
  }

  const updated = await prisma.merchantSubscription.update({
    where: { id: row.id },
    data,
  })
  await syncMerchantCasesPublicIndex(row.merchantId)
  return updated
}

async function getOrCreateSubscription(merchantId) {
  const repo = subscriptionRepo()
  if (!repo) {
    const err = new Error(SUBSCRIPTION_SETUP_HINT)
    err.status = 503
    err.code = 100503
    throw err
  }
  let row = await repo.findUnique({
    where: { merchantId },
  })
  if (!row) {
    row = await repo.create({
      data: {
        id: newId('msub'),
        merchantId,
        plan: MERCHANT_PLAN.FREE,
        status: MERCHANT_SUBSCRIPTION_STATUS.ACTIVE,
      },
    })
  }
  return applyPendingPlanIfExpired(row)
}

async function getMerchantSubscription(merchantId) {
  const row = await getOrCreateSubscription(merchantId)
  return formatSubscriptionRow(row)
}

/**
 * CASE-MCH-02 · 商家内容优化能力（规则建议；公域套餐与免费版一致）
 * @param {object|null} subscriptionRow formatSubscriptionRow 或 prisma 行
 */
function resolveMerchantContentOptimizeCapability(subscription) {
  const sub = subscription || {}
  const active = sub.status === MERCHANT_SUBSCRIPTION_STATUS.ACTIVE
  const plan = active ? sub.plan || MERCHANT_PLAN.FREE : MERCHANT_PLAN.FREE

  const base = {
    plan,
    planLabel: MERCHANT_PLAN_LABELS[plan] || MERCHANT_PLAN_LABELS[MERCHANT_PLAN.FREE],
    mode: 'rule',
    llmEnabled: false,
    canGenerate: true,
    canApply: true,
  }

  return {
    ...base,
    hint: '提供规则建议优化文案（授权前，商家确认后写入相册）',
  }
}

async function isEligibleForStandardTrial(subscriptionRow) {
  if (!subscriptionRow) return false
  if (Boolean(subscriptionRow.standardTrialUsed)) return false
  if (subscriptionRow.plan !== MERCHANT_PLAN.FREE) return false
  if (subscriptionRow.pendingPlan) return false

  const priorStandardOrder = await prisma.merchantPaymentOrder.findFirst({
    where: {
      merchantId: subscriptionRow.merchantId,
      plan: MERCHANT_PLAN.INDEX_99,
      status: MERCHANT_PAYMENT_STATUS.PAID,
    },
    select: { id: true },
  })
  return !priorStandardOrder
}

async function merchantHasPublicIndex(merchantId) {
  if (!merchantId || !subscriptionRepo()) return false
  try {
    const row = await getOrCreateSubscription(merchantId)
    return hasPublicIndexEntitlement(row)
  } catch (e) {
    console.warn('[merchant-subscription] merchantHasPublicIndex', e && e.message)
    return false
  }
}

async function resolveMerchantIdsWithPublicIndex() {
  const repo = subscriptionRepo()
  if (!repo) return new Set()
  const now = new Date()
  const rows = await repo.findMany({
    where: {
      plan: { in: [...PUBLIC_INDEX_PLANS] },
      status: MERCHANT_SUBSCRIPTION_STATUS.ACTIVE,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { merchantId: true },
  })
  return new Set(rows.map((r) => r.merchantId))
}

async function resolveCaseSeoNoindexForMerchant(merchantId, baseInput = {}) {
  const baseNoindex = resolveSeoNoindex(baseInput)
  if (baseNoindex) return true
  const entitled = await merchantHasPublicIndex(merchantId)
  return !entitled
}

async function resolveCaseSeoNoindexForStore(storeId, baseInput = {}) {
  if (!storeId) return true
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { merchantId: true },
  })
  if (!store?.merchantId) return true
  return resolveCaseSeoNoindexForMerchant(store.merchantId, baseInput)
}

async function syncMerchantCasesPublicIndex(merchantId) {
  const stores = await prisma.store.findMany({
    where: { merchantId },
    select: { id: true },
  })
  const storeIds = stores.map((s) => s.id)
  if (!storeIds.length) return { updated: 0 }

  const cases = await prisma.publicCase.findMany({
    where: {
      storeId: { in: storeIds },
      status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
    },
    include: {
      album: {
        include: {
          images: true,
        },
      },
    },
  })

  let updated = 0
  for (const row of cases) {
    const imageCount = (row.album?.images || []).length
    const resolved = await resolveCaseSeoNoindexForStore(row.storeId, {
      city: row.city,
      serviceName: row.serviceName,
      imageCount,
    })
    if (Boolean(row.seoNoindex) !== resolved) {
      await prisma.publicCase.update({
        where: { id: row.id },
        data: { seoNoindex: resolved },
      })
      updated += 1
    }
  }
  return { updated }
}

async function resolveLastPaidAmountCents(merchantId, plan) {
  const order = await prisma.merchantPaymentOrder.findFirst({
    where: {
      merchantId,
      plan,
      status: 'paid',
    },
    orderBy: { paidAt: 'desc' },
  })
  if (order?.amount > 0) return order.amount
  return MERCHANT_PLAN_PRICE_CENTS[plan] || 0
}

/**
 * 按剩余天数折算当前套餐可抵扣金额（分）
 */
async function computeRemainingCreditCents(subscriptionRow) {
  if (!subscriptionRow || !PUBLIC_INDEX_PLANS.has(subscriptionRow.plan)) return 0
  if (!isSubscriptionActive(subscriptionRow) || !subscriptionRow.expiresAt) return 0
  const now = Date.now()
  const expiresAt = subscriptionRow.expiresAt.getTime()
  if (expiresAt <= now) return 0

  const paidCents = await resolveLastPaidAmountCents(
    subscriptionRow.merchantId,
    subscriptionRow.plan
  )
  if (paidCents <= 0) return 0

  const remainingMs = expiresAt - now
  const dayMs = 24 * 60 * 60 * 1000
  const remainingDays = remainingMs / dayMs
  return Math.max(0, Math.floor((paidCents * remainingDays) / SUBSCRIPTION_TERM_DAYS))
}

function isWithinRenewalWindow(subscriptionRow) {
  if (!subscriptionRow?.expiresAt) return false
  const daysLeft = daysUntilSubscriptionExpiry(subscriptionRow)
  return daysLeft !== null && daysLeft >= 0 && daysLeft <= RENEWAL_NOTICE_DAYS
}

/** 同档续费：当前付费档未过期即可续；过期后同档视为重新开通 */
function canRenewSamePlan(subscriptionRow, plan) {
  if (!subscriptionRow || subscriptionRow.pendingPlan) return false
  if (!isSellablePlanCode(plan)) return false
  if (subscriptionRow.plan !== plan) return false
  if (!isPaidPlan(subscriptionRow.plan)) return false
  return isSubscriptionActive(subscriptionRow)
}

function daysUntilSubscriptionExpiry(subscriptionRow) {
  if (!subscriptionRow?.expiresAt) return null
  const remainingMs = subscriptionRow.expiresAt.getTime() - Date.now()
  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000))
}

function resolveNextPeriodLabel(subscriptionRow) {
  if (subscriptionRow?.pendingPlan) {
    return (
      MERCHANT_PLAN_TAG_LABELS[subscriptionRow.pendingPlan] ||
      MERCHANT_PLAN_LABELS[MERCHANT_PLAN.TASTE]
    )
  }
  const effective = resolveEffectivePlan(subscriptionRow)
  if (isPaidPlan(subscriptionRow?.plan) && subscriptionRow?.expiresAt) {
    return `${MERCHANT_PLAN_LABELS[effective]}（到期需手动续费）`
  }
  return MERCHANT_PLAN_LABELS[MERCHANT_PLAN.TASTE]
}

function buildRenewalNotice(subscriptionRow) {
  if (!subscriptionRow || !isPaidPlan(subscriptionRow.plan)) {
    return { show: false }
  }
  if (!isSubscriptionActive(subscriptionRow) && subscriptionRow.expiresAt) {
    return {
      show: true,
      daysLeft: 0,
      level: 'urgent',
      message: '套餐已到期，请续费',
      canPay: !subscriptionRow.pendingPlan,
    }
  }
  const daysLeft = daysUntilSubscriptionExpiry(subscriptionRow)
  if (daysLeft === null || daysLeft > RENEWAL_NOTICE_DAYS) {
    return { show: false }
  }
  return {
    show: true,
    daysLeft,
    level: 'urgent',
    message:
      daysLeft <= 0
        ? '套餐今日到期，请续费'
        : `还剩 ${daysLeft} 天到期，去续费`,
    canPay: !subscriptionRow.pendingPlan && canRenewSamePlan(subscriptionRow, subscriptionRow.plan),
  }
}

function emptyMoneyQuote(extra = {}) {
  return {
    refundCents: 0,
    payCents: 0,
    creditCents: 0,
    amountCents: 0,
    refundExcessCents: 0,
    creditAppliedCents: 0,
    creditYuan: '0.00',
    amountYuan: '0.00',
    refundYuan: '0.00',
    payYuan: '0.00',
    refundExcessYuan: '0.00',
    ...extra,
  }
}

function buildPlanSwitchQuote(
  subscriptionRow,
  targetPlan,
  listPriceCents,
  chargePriceCents = listPriceCents,
) {
  if (!isSellablePlanCode(targetPlan)) {
    return Promise.resolve(
      emptyMoneyQuote({
        switchMode: 'invalid',
        isCurrentPlan: false,
        isPendingPlan: false,
        listPriceCents: 0,
        summary: '无效套餐',
      }),
    )
  }

  const currentPlan = subscriptionRow?.plan || MERCHANT_PLAN.FREE
  const activePaid =
    isPaidPlan(currentPlan) && isSubscriptionActive(subscriptionRow)
  const payCents = chargePriceCents
  const payYuan = (payCents / 100).toFixed(2)
  const listPayYuan = (listPriceCents / 100).toFixed(2)
  let summary = `需支付 ¥${listPayYuan}/月`
  if (payCents !== listPriceCents && config.wechatPay.subscriptionTestAmountCents != null) {
    summary += `（联调实付 ¥${payYuan}）`
  }

  if (activePaid && currentPlan === targetPlan) {
    if (canRenewSamePlan(subscriptionRow, targetPlan)) {
      return Promise.resolve(
        emptyMoneyQuote({
          switchMode: 'renew',
          isCurrentPlan: false,
          isPendingPlan: false,
          payCents,
          amountCents: payCents,
          listPriceCents,
          amountYuan: payYuan,
          payYuan,
          summary: `续费一个月 ¥${listPayYuan}`,
        }),
      )
    }
    return Promise.resolve(
      emptyMoneyQuote({
        switchMode: 'current',
        isCurrentPlan: true,
        isPendingPlan: false,
        listPriceCents,
        summary: '当前套餐',
      }),
    )
  }

  if (activePaid && isPlanDowngrade(currentPlan, targetPlan)) {
    const isPending = subscriptionRow.pendingPlan === targetPlan
    const targetLabel =
      MERCHANT_PLAN_TAG_LABELS[targetPlan] || MERCHANT_PLAN_LABELS[MERCHANT_PLAN.TASTE]
    const effectiveAt = subscriptionRow.expiresAt
      ? subscriptionRow.expiresAt.toISOString()
      : null
    return Promise.resolve(
      emptyMoneyQuote({
        switchMode: 'downgrade_scheduled',
        isCurrentPlan: false,
        isPendingPlan: isPending,
        listPriceCents: 0,
        effectiveAt,
        summary: isPending
          ? `已预约：到期后切换为${targetLabel}`
          : `到期后切换为${targetLabel}，本期不退费`,
      }),
    )
  }

  const switchMode =
    activePaid && isPlanUpgrade(currentPlan, targetPlan) ? 'upgrade' : 'purchase'
  return Promise.resolve(
    emptyMoneyQuote({
      switchMode,
      isCurrentPlan: false,
      isPendingPlan: false,
      payCents,
      amountCents: payCents,
      listPriceCents,
      amountYuan: payYuan,
      payYuan,
      summary,
    }),
  )
}

async function schedulePlanDowngrade(merchantId, targetPlan) {
  assertSubscriptionPrismaReady()
  const row = await getOrCreateSubscription(merchantId)
  if (!isPaidPlan(row.plan) || !isSubscriptionActive(row)) {
    const err = new Error('当前套餐无需预约降级')
    err.status = 409
    throw err
  }
  if (!isSellablePlanCode(targetPlan) || !isPlanDowngrade(row.plan, targetPlan)) {
    const err = new Error('仅支持降级至更低档位')
    err.status = 400
    throw err
  }
  if (row.pendingPlan === targetPlan) {
    const err = new Error('已预约该方案，到期后自动切换')
    err.status = 409
    throw err
  }
  if (row.pendingPlan && row.pendingPlan !== targetPlan) {
    const err = new Error('请先取消当前预约，再选择其他套餐')
    err.status = 409
    throw err
  }
  await prisma.merchantSubscription.update({
    where: { merchantId },
    data: { pendingPlan: targetPlan },
  })
  return getOrCreateSubscription(merchantId)
}

function computeRenewExpiresAt(currentExpiresAt, termDays = SUBSCRIPTION_TERM_DAYS) {
  const now = new Date()
  const base =
    currentExpiresAt && currentExpiresAt.getTime() > now.getTime()
      ? currentExpiresAt
      : now
  const next = new Date(base)
  next.setDate(next.getDate() + termDays)
  return next
}

function computeIndexingSlaDeadline(fromDate = new Date()) {
  const deadline = new Date(fromDate)
  deadline.setDate(deadline.getDate() + 30)
  return deadline
}

async function activateMerchantPlan(merchantId, plan, options = {}) {
  assertSubscriptionPrismaReady()
  if (!isSellablePlanCode(plan)) {
    const err = new Error('无效的套餐类型')
    err.status = 400
    throw err
  }

  const existing = await getOrCreateSubscription(merchantId)
  const now = new Date()
  const isRenewal =
    existing.plan === plan &&
    isPaidPlan(existing.plan) &&
    isSubscriptionActive(existing) &&
    existing.expiresAt &&
    !options.forceNewTerm

  const expiresAt = isRenewal
    ? computeRenewExpiresAt(existing.expiresAt, SUBSCRIPTION_TERM_DAYS)
    : computeRenewExpiresAt(null, SUBSCRIPTION_TERM_DAYS)

  const data = {
    plan,
    status: MERCHANT_SUBSCRIPTION_STATUS.ACTIVE,
    startedAt: isRenewal ? existing.startedAt || now : now,
    expiresAt,
    pendingPlan: null,
  }

  if (!existing.indexingSlaMet) {
    data.indexingSlaDeadline = computeIndexingSlaDeadline(now)
  }

  if (options.founderFlag != null) {
    data.founderFlag = Boolean(options.founderFlag)
  }
  if (options.founderRenewDiscount != null) {
    data.founderRenewDiscount = options.founderRenewDiscount
  }

  await prisma.merchantSubscription.update({
    where: { merchantId },
    data,
  })

  await syncMerchantCasesPublicIndex(merchantId)
  return getMerchantSubscription(merchantId)
}

function resolvePlanPriceCents(plan) {
  if (!isSellablePlanCode(plan)) return 0
  return MERCHANT_PLAN_PRICE_CENTS[plan] || 0
}

async function resolvePlanPriceCentsForStore(plan, storeId) {
  if (!isSellablePlanCode(plan)) return 0
  try {
    const { resolvePricingTableForStore } = require('./merchant-plan-pricing.service')
    const priced = await resolvePricingTableForStore(storeId || '', '')
    const col = (priced.columns || []).find((c) => c.planCode === plan)
    if (col && col.priceCents != null) return col.priceCents
  } catch (e) {
    console.warn('[merchant-subscription] price for store', e && e.message)
  }
  return resolvePlanPriceCents(plan)
}

/** 实际向微信下单的金额（分）；联调时可由 WECHAT_PAY_SUBSCRIPTION_TEST_AMOUNT_CENTS 覆盖 */
function resolveChargeAmountCents(plan, subscriptionRow, listPriceCents) {
  const test = config.wechatPay.subscriptionTestAmountCents
  if (test != null) return test
  if (listPriceCents != null) return listPriceCents
  return resolvePlanPriceCents(plan, subscriptionRow)
}

async function listPlanCatalog(subscriptionRow, options = {}) {
  const testCents = config.wechatPay.subscriptionTestAmountCents
  const storeId = options.storeId || ''
  const out = []
  for (const item of PLAN_CATALOG) {
    const listPriceCents = await resolvePlanPriceCentsForStore(item.plan, storeId)
    const priceCents = testCents != null ? testCents : listPriceCents
    const priceLabel =
      testCents != null
        ? `测试价 ¥${(testCents / 100).toFixed(2)}/月`
        : `¥${(priceCents / 100).toFixed(0)}/月`
    out.push({
      ...item,
      priceCents,
      listPriceCents,
      priceLabel,
      paymentTestMode: testCents != null,
    })
  }
  return out
}

async function enrichPlanCatalogWithQuotes(subscriptionRow, plans) {
  const enriched = []
  for (const item of plans) {
    const quote = await buildPlanSwitchQuote(
      subscriptionRow,
      item.plan,
      item.listPriceCents,
      item.priceCents,
    )
    enriched.push({ ...item, switchQuote: quote })
  }
  return enriched
}

function buildPricingCue({
  effectivePlan,
  effectivePlanLabel,
  usedAiQuota,
  aiQuotaLimit,
  usedPublicHostQuota,
  publicHostQuotaLimit,
  usedQuota,
  quotaLimit,
  daysLeft,
}) {
  const aiUsed = usedAiQuota != null ? Number(usedAiQuota) : Number(usedQuota)
  const aiLimit = aiQuotaLimit != null ? Number(aiQuotaLimit) : Number(quotaLimit)
  if (Number.isFinite(aiUsed) && Number.isFinite(aiLimit) && aiUsed >= aiLimit) {
    return { text: 'AI额度已满，去升级', kind: 'ai_quota_full' }
  }
  const hostUsed = Number(usedPublicHostQuota)
  const hostLimit = Number(publicHostQuotaLimit)
  if (Number.isFinite(hostUsed) && Number.isFinite(hostLimit) && hostUsed >= hostLimit) {
    return { text: '托管额度已满，去升级', kind: 'host_quota_full' }
  }
  if (
    daysLeft !== null &&
    daysLeft !== undefined &&
    daysLeft >= 0 &&
    daysLeft <= RENEWAL_NOTICE_DAYS
  ) {
    return {
      text: daysLeft <= 0 ? '今日到期，去续费' : `还剩 ${daysLeft} 天到期，去续费`,
      kind: 'expiring',
      daysLeft,
    }
  }
  return {
    text: effectivePlanLabel || MERCHANT_PLAN_LABELS[effectivePlan] || '尝鲜版',
    kind: 'plan',
  }
}

async function fetchMerchantSubscriptionPanel(auth) {
  assertSubscriptionPrismaReady()
  const merchantId = auth.merchantId
  const row = await getOrCreateSubscription(merchantId)
  await syncMerchantCasesPublicIndex(merchantId).catch(() => {})
  const subscription = formatSubscriptionRow(row)
  const effectivePlan = subscription.effectivePlan || MERCHANT_PLAN.TASTE
  const {
    getMerchantQuotaSnapshot,
  } = require('./merchant-plan-quota.service')
  const quotaSnap = await getMerchantQuotaSnapshot(merchantId, effectivePlan)
  const daysLeft = isPaidPlan(row.plan) && isSubscriptionActive(row)
    ? daysUntilSubscriptionExpiry(row)
    : null
  subscription.usedAiQuota = quotaSnap.usedAiQuota
  subscription.aiQuotaLimit = quotaSnap.aiQuotaLimit
  subscription.usedPublicHostQuota = quotaSnap.usedPublicHostQuota
  subscription.publicHostQuotaLimit = quotaSnap.publicHostQuotaLimit
  subscription.usedQuota = quotaSnap.usedAiQuota
  subscription.quotaLimit = quotaSnap.aiQuotaLimit
  subscription.daysLeft = daysLeft
  subscription.standardTrialEligible = false
  subscription.planTag = {
    tier: MERCHANT_PLAN_TAG_TIERS[effectivePlan] || 'basic',
    text: subscription.effectivePlanLabel,
    canUpgrade:
      quotaSnap.usedAiQuota >= quotaSnap.aiQuotaLimit ||
      quotaSnap.usedPublicHostQuota >= quotaSnap.publicHostQuotaLimit,
  }
  subscription.pricingCue = buildPricingCue({
    effectivePlan,
    effectivePlanLabel: subscription.effectivePlanLabel,
    usedAiQuota: quotaSnap.usedAiQuota,
    aiQuotaLimit: quotaSnap.aiQuotaLimit,
    usedPublicHostQuota: quotaSnap.usedPublicHostQuota,
    publicHostQuotaLimit: quotaSnap.publicHostQuotaLimit,
    daysLeft,
  })
  const plans = await listPlanCatalog(row, { storeId: auth.storeId || '' })
  const plansWithQuotes = await enrichPlanCatalogWithQuotes(row, plans)
  let pricingTable = null
  let planColumns = []
  try {
    const { resolvePricingTableForStore } = require('./merchant-plan-pricing.service')
    const priced = await resolvePricingTableForStore(auth.storeId || '', effectivePlan)
    pricingTable = priced.pricingTable
    planColumns = priced.columns
  } catch (e) {
    console.warn('[merchant-subscription] pricing table', e && e.message)
  }
  const testMode = Boolean(config.wechatPay.subscriptionTestAmountCents != null)
  return {
    subscription,
    plans: plansWithQuotes,
    pricingTable,
    planColumns,
    usedAiQuota: quotaSnap.usedAiQuota,
    aiQuotaLimit: quotaSnap.aiQuotaLimit,
    usedPublicHostQuota: quotaSnap.usedPublicHostQuota,
    publicHostQuotaLimit: quotaSnap.publicHostQuotaLimit,
    usedQuota: quotaSnap.usedAiQuota,
    quotaLimit: quotaSnap.aiQuotaLimit,
    effectivePlan,
    canPay: true,
    planStatus: {
      currentPlan: subscription.plan,
      effectivePlan,
      currentTierLabel: subscription.effectivePlanLabel,
      currentPlanLabel: subscription.effectivePlanLabel,
      expiresAtDisplay: subscription.expiresAt
        ? String(subscription.expiresAt).slice(0, 10)
        : '',
      nextTierLabel: resolveNextPeriodLabel(row),
      hasPendingChange: Boolean(subscription.pendingPlan),
      pendingPlanLabel: subscription.pendingPlanLabel || '',
      canCancelPending: Boolean(subscription.pendingPlan),
      canScheduleChange: isPaidPlan(row.plan) && isSubscriptionActive(row),
      manualRenewOnly: true,
      usedAiQuota: quotaSnap.usedAiQuota,
      aiQuotaLimit: quotaSnap.aiQuotaLimit,
      usedPublicHostQuota: quotaSnap.usedPublicHostQuota,
      publicHostQuotaLimit: quotaSnap.publicHostQuotaLimit,
      usedQuota: quotaSnap.usedAiQuota,
      quotaLimit: quotaSnap.aiQuotaLimit,
      daysLeft,
    },
    pricingCue: subscription.pricingCue,
    renewalNotice: buildRenewalNotice(row),
    paymentTestMode: testMode,
    wechatPayConfigured: Boolean(config.wechatPay.configured),
  }
}

module.exports = {
  MERCHANT_PLAN,
  formatSubscriptionRow,
  getOrCreateSubscription,
  getMerchantSubscription,
  merchantHasPublicIndex,
  resolveMerchantIdsWithPublicIndex,
  resolveCaseSeoNoindexForMerchant,
  resolveCaseSeoNoindexForStore,
  syncMerchantCasesPublicIndex,
  activateMerchantPlan,
  resolvePlanPriceCents,
  resolvePlanPriceCentsForStore,
  resolveChargeAmountCents,
  listPlanCatalog,
  fetchMerchantSubscriptionPanel,
  hasPublicIndexEntitlement,
  isSubscriptionActive,
  resolveEffectivePlan,
  resolveMerchantContentOptimizeCapability,
  isEligibleForStandardTrial,
  computeRemainingCreditCents,
  buildPlanSwitchQuote,
  schedulePlanDowngrade,
  resolveLastPaidAmountCents,
  canRenewSamePlan,
  isWithinRenewalWindow,
  daysUntilSubscriptionExpiry,
  buildPricingCue,
  caseQuotaForPlan,
  isPaidPlan,
  isSellablePlanCode,
}
