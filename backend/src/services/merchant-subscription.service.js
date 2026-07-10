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
  SUBSCRIPTION_TERM_DAYS,
  STANDARD_TRIAL_DAYS,
  PLAN_CATALOG,
} = require('../constants/merchant-subscription')
const { assertPrismaDelegate } = require('../lib/prisma')

const SUBSCRIPTION_SETUP_HINT =
  'merchant_subscriptions 未就绪：请在 backend 执行 npm run db:setup:prod 后 pm2 restart zhejian-api'

const PLAN_RANK = {
  [MERCHANT_PLAN.FREE]: 0,
  [MERCHANT_PLAN.INDEX_99]: 1,
  [MERCHANT_PLAN.OPTIMIZE_299]: 1,
}

function compareMerchantPlans(fromPlan, toPlan) {
  return (PLAN_RANK[fromPlan] ?? 0) - (PLAN_RANK[toPlan] ?? 0)
}

function isPlanUpgrade(fromPlan, toPlan) {
  return compareMerchantPlans(fromPlan, toPlan) < 0
}

function isPlanDowngrade(fromPlan, toPlan) {
  return compareMerchantPlans(fromPlan, toPlan) > 0
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
  if (row.plan === MERCHANT_PLAN.FREE) return true
  if (!row.expiresAt) return true
  return row.expiresAt.getTime() > Date.now()
}

function hasPublicIndexEntitlement(row) {
  if (!isSubscriptionActive(row)) return false
  return PUBLIC_INDEX_PLANS.has(row.plan)
}

function formatSubscriptionRow(row) {
  if (!row) {
    return {
      plan: MERCHANT_PLAN.FREE,
      planLabel: MERCHANT_PLAN_LABELS[MERCHANT_PLAN.FREE],
      status: MERCHANT_SUBSCRIPTION_STATUS.ACTIVE,
      publicIndex: false,
      expiresAt: null,
      founderFlag: false,
      founderRenewDiscount: null,
      indexingSlaDeadline: null,
      indexingSlaMet: false,
      standardTrialUsed: false,
    }
  }
  const active = isSubscriptionActive(row)
  const publicIndex = active && hasPublicIndexEntitlement(row)
  return {
    plan: row.plan || MERCHANT_PLAN.FREE,
    planLabel: MERCHANT_PLAN_LABELS[row.plan] || MERCHANT_PLAN_LABELS[MERCHANT_PLAN.FREE],
    status: active ? row.status : MERCHANT_SUBSCRIPTION_STATUS.EXPIRED,
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
      ? MERCHANT_PLAN_TAG_LABELS[row.pendingPlan] || MERCHANT_PLAN_TAG_LABELS[MERCHANT_PLAN.FREE]
      : null,
    pendingEffectiveAt: row.pendingPlan && row.expiresAt ? row.expiresAt.toISOString() : null,
    standardTrialUsed: Boolean(row.standardTrialUsed),
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
    status: MERCHANT_SUBSCRIPTION_STATUS.ACTIVE,
    expiresAt: null,
  }
  if (plan !== MERCHANT_PLAN.FREE && PUBLIC_INDEX_PLANS.has(plan)) {
    data.status = MERCHANT_SUBSCRIPTION_STATUS.EXPIRED
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

  if (active && PUBLIC_INDEX_PLANS.has(plan)) {
    return {
      ...base,
      hint: '标准版：提供规则建议优化文案（授权前，商家确认后写入相册）',
    }
  }

  return {
    ...base,
    hint: '免费版：提供规则建议；开通标准版后可公域收录',
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

const SUBSCRIPTION_RENEWAL_WINDOW_DAYS = 30

function isWithinRenewalWindow(subscriptionRow) {
  if (!subscriptionRow?.expiresAt) return false
  const remainingMs = subscriptionRow.expiresAt.getTime() - Date.now()
  return remainingMs <= SUBSCRIPTION_RENEWAL_WINDOW_DAYS * 24 * 60 * 60 * 1000
}

function canRenewSamePlan(subscriptionRow, plan) {
  if (!subscriptionRow || subscriptionRow.pendingPlan) return false
  if (!PUBLIC_INDEX_PLANS.has(plan)) return false
  const currentPlan = subscriptionRow.plan
  const matchesCurrent =
    currentPlan === plan ||
    (currentPlan === MERCHANT_PLAN.OPTIMIZE_299 && plan === MERCHANT_PLAN.INDEX_99)
  if (!matchesCurrent) return false
  if (!isSubscriptionActive(subscriptionRow)) return true
  return isWithinRenewalWindow(subscriptionRow)
}

function daysUntilSubscriptionExpiry(subscriptionRow) {
  if (!subscriptionRow?.expiresAt) return null
  const remainingMs = subscriptionRow.expiresAt.getTime() - Date.now()
  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000))
}

function resolveNextPeriodLabel(subscriptionRow) {
  const currentPlan = subscriptionRow?.plan || MERCHANT_PLAN.FREE
  if (subscriptionRow?.pendingPlan) {
    return (
      MERCHANT_PLAN_TAG_LABELS[subscriptionRow.pendingPlan] ||
      MERCHANT_PLAN_LABELS[MERCHANT_PLAN.FREE]
    )
  }
  if (PUBLIC_INDEX_PLANS.has(currentPlan) && subscriptionRow?.expiresAt) {
    return `同当前套餐（到期前需手动支付续费，不会自动扣款）`
  }
  return MERCHANT_PLAN_TAG_LABELS[MERCHANT_PLAN.FREE]
}

function buildRenewalNotice(subscriptionRow) {
  if (!subscriptionRow || !PUBLIC_INDEX_PLANS.has(subscriptionRow.plan)) {
    return { show: false }
  }
  if (!isSubscriptionActive(subscriptionRow) && subscriptionRow.expiresAt) {
    return {
      show: true,
      daysLeft: 0,
      level: 'urgent',
      message: '套餐已到期，请手动支付续费以恢复公域收录',
      canPay: !subscriptionRow.pendingPlan,
    }
  }
  const daysLeft = daysUntilSubscriptionExpiry(subscriptionRow)
  if (daysLeft === null || daysLeft > SUBSCRIPTION_RENEWAL_WINDOW_DAYS) {
    return { show: false }
  }
  return {
    show: true,
    daysLeft,
    level: daysLeft <= 7 ? 'urgent' : 'warning',
    message:
      daysLeft <= 0
        ? '套餐今日到期，请手动支付续费'
        : `套餐还有 ${daysLeft} 天到期，不会自动续费，请及时支付`,
    canPay: !subscriptionRow.pendingPlan && canRenewSamePlan(subscriptionRow, subscriptionRow.plan),
  }
}

function buildPlanSwitchQuote(
  subscriptionRow,
  targetPlan,
  listPriceCents,
  chargePriceCents = listPriceCents,
  options = {}
) {
  const currentPlan = subscriptionRow?.plan || MERCHANT_PLAN.FREE
  const trialEligible = Boolean(options.trialEligible)

  if (targetPlan === MERCHANT_PLAN.FREE && currentPlan === MERCHANT_PLAN.FREE) {
    return Promise.resolve({
      switchMode: 'current',
      isCurrentPlan: true,
      isPendingPlan: false,
      refundCents: 0,
      payCents: 0,
      creditCents: 0,
      amountCents: 0,
      refundExcessCents: 0,
      creditAppliedCents: 0,
      listPriceCents: 0,
      creditYuan: '0.00',
      amountYuan: '0.00',
      refundYuan: '0.00',
      payYuan: '0.00',
      refundExcessYuan: '0.00',
      summary: '当前套餐',
    })
  }

  const isCurrentPaidPlan =
    (currentPlan === targetPlan ||
      (currentPlan === MERCHANT_PLAN.OPTIMIZE_299 && targetPlan === MERCHANT_PLAN.INDEX_99)) &&
    isSubscriptionActive(subscriptionRow) &&
    hasPublicIndexEntitlement(subscriptionRow)
  if (isCurrentPaidPlan) {
    if (canRenewSamePlan(subscriptionRow, targetPlan)) {
      const payCents = chargePriceCents
      const payYuan = (payCents / 100).toFixed(2)
      const listPayYuan = (listPriceCents / 100).toFixed(2)
      return Promise.resolve({
        switchMode: 'renew',
        isCurrentPlan: false,
        isPendingPlan: false,
        refundCents: 0,
        payCents,
        creditCents: 0,
        amountCents: payCents,
        refundExcessCents: 0,
        creditAppliedCents: 0,
        listPriceCents,
        creditYuan: '0.00',
        amountYuan: payYuan,
        refundYuan: '0.00',
        payYuan,
        refundExcessYuan: '0.00',
        summary: `续费一年 ¥${listPayYuan}`,
      })
    }
    return Promise.resolve({
      switchMode: 'current',
      isCurrentPlan: true,
      isPendingPlan: false,
      refundCents: 0,
      payCents: 0,
      creditCents: 0,
      amountCents: 0,
      refundExcessCents: 0,
      creditAppliedCents: 0,
      listPriceCents,
      creditYuan: '0.00',
      amountYuan: '0.00',
      refundYuan: '0.00',
      payYuan: '0.00',
      refundExcessYuan: '0.00',
      summary: '当前套餐',
    })
  }

  if (
    isPlanDowngrade(currentPlan, targetPlan) &&
    isSubscriptionActive(subscriptionRow) &&
    hasPublicIndexEntitlement(subscriptionRow)
  ) {
    const isPending = subscriptionRow.pendingPlan === targetPlan
    const targetLabel =
      MERCHANT_PLAN_TAG_LABELS[targetPlan] || MERCHANT_PLAN_LABELS[MERCHANT_PLAN.FREE]
    const effectiveAt = subscriptionRow.expiresAt
      ? subscriptionRow.expiresAt.toISOString()
      : null
    return Promise.resolve({
      switchMode: 'downgrade_scheduled',
      isCurrentPlan: false,
      isPendingPlan: isPending,
      refundCents: 0,
      payCents: 0,
      creditCents: 0,
      amountCents: 0,
      refundExcessCents: 0,
      creditAppliedCents: 0,
      listPriceCents: 0,
      effectiveAt,
      creditYuan: '0.00',
      amountYuan: '0.00',
      refundYuan: '0.00',
      payYuan: '0.00',
      refundExcessYuan: '0.00',
      summary: isPending
        ? `已预约：有效期结束后切换为${targetLabel}`
        : `有效期结束后切换为${targetLabel}，本期不退费`,
    })
  }

  if (
    targetPlan === MERCHANT_PLAN.INDEX_99 &&
    trialEligible &&
    currentPlan === MERCHANT_PLAN.FREE &&
    !subscriptionRow?.pendingPlan
  ) {
    return Promise.resolve({
      switchMode: 'trial',
      isCurrentPlan: false,
      isPendingPlan: false,
      refundCents: 0,
      payCents: 0,
      creditCents: 0,
      amountCents: 0,
      refundExcessCents: 0,
      creditAppliedCents: 0,
      listPriceCents,
      creditYuan: '0.00',
      amountYuan: '0.00',
      refundYuan: '0.00',
      payYuan: '0.00',
      refundExcessYuan: '0.00',
      summary: `首次开通标准版，享 ${STANDARD_TRIAL_DAYS / 30} 个月免费试用`,
      trialDays: STANDARD_TRIAL_DAYS,
    })
  }

  return computeRemainingCreditCents(subscriptionRow).then((refundCents) => {
    const payCents = chargePriceCents
    const listPayYuan = (listPriceCents / 100).toFixed(2)
    const refundYuan = (refundCents / 100).toFixed(2)
    const payYuan = (payCents / 100).toFixed(2)
    let summary = ''
    if (refundCents > 0) {
      summary = `原方案剩余 ¥${refundYuan} 将原路退回，需支付新方案 ¥${listPayYuan}`
    } else {
      summary = `需支付新方案 ¥${listPayYuan}`
    }
    if (payCents !== listPriceCents && config.wechatPay.subscriptionTestAmountCents != null) {
      summary += `（联调实付 ¥${payYuan}）`
    }
    return {
      switchMode: 'upgrade',
      isCurrentPlan: false,
      isPendingPlan: false,
      refundCents,
      payCents,
      creditCents: refundCents,
      amountCents: payCents,
      refundExcessCents: refundCents,
      creditAppliedCents: 0,
      listPriceCents,
      creditYuan: refundYuan,
      amountYuan: payYuan,
      refundYuan,
      payYuan,
      refundExcessYuan: refundYuan,
      summary,
    }
  })
}

async function schedulePlanDowngrade(merchantId, targetPlan) {
  assertSubscriptionPrismaReady()
  const row = await getOrCreateSubscription(merchantId)
  if (!isSubscriptionActive(row) || !hasPublicIndexEntitlement(row)) {
    const err = new Error('当前套餐无需预约降级')
    err.status = 409
    throw err
  }
  if (!isPlanDowngrade(row.plan, targetPlan)) {
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
  if (!PUBLIC_INDEX_PLANS.has(plan) && plan !== MERCHANT_PLAN.FREE) {
    const err = new Error('无效的套餐类型')
    err.status = 400
    throw err
  }

  const existing = await getOrCreateSubscription(merchantId)
  const now = new Date()
  const isPlanChange =
    PUBLIC_INDEX_PLANS.has(existing.plan) &&
    existing.plan !== plan &&
    isSubscriptionActive(existing) &&
    hasPublicIndexEntitlement(existing)
  const isRenewal =
    !isPlanChange &&
    PUBLIC_INDEX_PLANS.has(existing.plan) &&
    (existing.plan === plan ||
      (existing.plan === MERCHANT_PLAN.OPTIMIZE_299 && plan === MERCHANT_PLAN.INDEX_99)) &&
    isSubscriptionActive(existing) &&
    existing.expiresAt &&
    !options.isStandardTrial

  let expiresAt = null
  const resolvedPlan =
    plan === MERCHANT_PLAN.INDEX_99 && existing.plan === MERCHANT_PLAN.OPTIMIZE_299
      ? MERCHANT_PLAN.INDEX_99
      : plan
  if (PUBLIC_INDEX_PLANS.has(resolvedPlan)) {
    const termDays = options.isStandardTrial
      ? STANDARD_TRIAL_DAYS
      : SUBSCRIPTION_TERM_DAYS
    expiresAt = isRenewal
      ? computeRenewExpiresAt(existing.expiresAt, SUBSCRIPTION_TERM_DAYS)
      : computeRenewExpiresAt(null, termDays)
  }

  const data = {
    plan: resolvedPlan,
    status: MERCHANT_SUBSCRIPTION_STATUS.ACTIVE,
    startedAt: isRenewal ? existing.startedAt || now : now,
    expiresAt,
    pendingPlan: null,
  }

  if (
    resolvedPlan === MERCHANT_PLAN.INDEX_99 &&
    (options.isStandardTrial ||
      Boolean(existing.standardTrialUsed) ||
      existing.plan === MERCHANT_PLAN.FREE)
  ) {
    data.standardTrialUsed = true
  }

  if (PUBLIC_INDEX_PLANS.has(resolvedPlan) && !existing.indexingSlaMet) {
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

function resolvePlanPriceCents(plan, subscriptionRow) {
  const base = MERCHANT_PLAN_PRICE_CENTS[plan]
  if (!base) return 0
  const isRenewal =
    subscriptionRow &&
    subscriptionRow.founderFlag &&
    subscriptionRow.founderRenewDiscount &&
    PUBLIC_INDEX_PLANS.has(subscriptionRow.plan)
  if (isRenewal) {
    return Math.round(base * Number(subscriptionRow.founderRenewDiscount))
  }
  return base
}

/** 实际向微信下单的金额（分）；联调时可由 WECHAT_PAY_SUBSCRIPTION_TEST_AMOUNT_CENTS 覆盖 */
function resolveChargeAmountCents(plan, subscriptionRow) {
  const test = config.wechatPay.subscriptionTestAmountCents
  if (test != null) return test
  return resolvePlanPriceCents(plan, subscriptionRow)
}

function listPlanCatalog(subscriptionRow, options = {}) {
  const testCents = config.wechatPay.subscriptionTestAmountCents
  const trialEligible = Boolean(options.trialEligible)
  return PLAN_CATALOG.map((item) => {
    const listPriceCents =
      item.plan === MERCHANT_PLAN.FREE
        ? 0
        : resolvePlanPriceCents(item.plan, subscriptionRow)
    const priceCents =
      item.plan === MERCHANT_PLAN.FREE
        ? 0
        : testCents != null
          ? testCents
          : listPriceCents
    let priceLabel =
      testCents != null && item.plan !== MERCHANT_PLAN.FREE
        ? `测试价 ¥${(testCents / 100).toFixed(2)} / 年`
        : priceCents === item.priceCents
          ? item.priceLabel
          : `¥${(priceCents / 100).toFixed(0)} / 年`
    if (item.plan === MERCHANT_PLAN.INDEX_99 && trialEligible && testCents == null) {
      priceLabel = item.trialLabel || priceLabel
    }
    return {
      ...item,
      priceCents,
      listPriceCents,
      priceLabel,
      trialEligible: item.plan === MERCHANT_PLAN.INDEX_99 && trialEligible,
      paymentTestMode: testCents != null && item.plan !== MERCHANT_PLAN.FREE,
    }
  })
}

async function enrichPlanCatalogWithQuotes(subscriptionRow, plans) {
  const trialEligible = await isEligibleForStandardTrial(subscriptionRow)
  const enriched = []
  for (const item of plans) {
    const listPriceCents =
      item.plan === MERCHANT_PLAN.FREE ? 0 : item.listPriceCents
    const chargePriceCents =
      item.plan === MERCHANT_PLAN.FREE ? 0 : item.priceCents
    const quote = await buildPlanSwitchQuote(
      subscriptionRow,
      item.plan,
      listPriceCents,
      chargePriceCents,
      {
        trialEligible: item.plan === MERCHANT_PLAN.INDEX_99 && trialEligible,
      }
    )
    enriched.push({ ...item, switchQuote: quote })
  }
  return enriched
}

async function fetchMerchantSubscriptionPanel(auth) {
  assertSubscriptionPrismaReady()
  const merchantId = auth.merchantId
  const row = await getOrCreateSubscription(merchantId)
  if (!hasPublicIndexEntitlement(row)) {
    await syncMerchantCasesPublicIndex(merchantId).catch(() => {})
  }
  const subscription = formatSubscriptionRow(row)
  const plan = subscription.plan || MERCHANT_PLAN.FREE
  subscription.planTag = {
    tier: MERCHANT_PLAN_TAG_TIERS[plan] || 'basic',
    text: MERCHANT_PLAN_TAG_LABELS[plan] || MERCHANT_PLAN_TAG_LABELS[MERCHANT_PLAN.FREE],
    canUpgrade: !PUBLIC_INDEX_PLANS.has(plan) || !hasPublicIndexEntitlement(row),
  }
  const standardTrialEligible = await isEligibleForStandardTrial(row)
  subscription.standardTrialEligible = standardTrialEligible
  const creditCents = await computeRemainingCreditCents(row)
  subscription.remainingCreditCents = creditCents
  subscription.remainingCreditYuan = (creditCents / 100).toFixed(2)
  const plans = listPlanCatalog(row, { trialEligible: standardTrialEligible })
  const plansWithQuotes = await enrichPlanCatalogWithQuotes(row, plans)
  const renewalNotice = buildRenewalNotice(row)
  return {
    subscription,
    plans: plansWithQuotes,
    planStatus: {
      currentPlan: plan,
      currentTierLabel:
        MERCHANT_PLAN_TAG_LABELS[plan] || MERCHANT_PLAN_TAG_LABELS[MERCHANT_PLAN.FREE],
      currentPlanLabel: subscription.planLabel,
      expiresAtDisplay: subscription.expiresAt
        ? String(subscription.expiresAt).slice(0, 10)
        : '',
      nextTierLabel: resolveNextPeriodLabel(row),
      hasPendingChange: Boolean(subscription.pendingPlan),
      pendingPlanLabel: subscription.pendingPlanLabel || '',
      canCancelPending: Boolean(subscription.pendingPlan),
      canScheduleChange:
        hasPublicIndexEntitlement(row) &&
        isSubscriptionActive(row) &&
        !subscription.pendingPlan,
      manualRenewOnly: true,
    },
    renewalNotice,
    paymentTestMode: config.wechatPay.subscriptionTestAmountCents != null,
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
  resolveChargeAmountCents,
  listPlanCatalog,
  fetchMerchantSubscriptionPanel,
  hasPublicIndexEntitlement,
  isSubscriptionActive,
  resolveMerchantContentOptimizeCapability,
  isEligibleForStandardTrial,
  computeRemainingCreditCents,
  buildPlanSwitchQuote,
  schedulePlanDowngrade,
  resolveLastPaidAmountCents,
  canRenewSamePlan,
  isWithinRenewalWindow,
  daysUntilSubscriptionExpiry,
}
