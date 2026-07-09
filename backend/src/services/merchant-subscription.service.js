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
  PUBLIC_INDEX_PLANS,
  SUBSCRIPTION_TERM_DAYS,
  PLAN_CATALOG,
} = require('../constants/merchant-subscription')
const { assertPrismaDelegate } = require('../lib/prisma')

const SUBSCRIPTION_SETUP_HINT =
  'merchant_subscriptions 未就绪：请在 backend 执行 npm run db:setup:prod 后 pm2 restart zhejian-api'

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
  }
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
  return row
}

async function getMerchantSubscription(merchantId) {
  const row = await getOrCreateSubscription(merchantId)
  return formatSubscriptionRow(row)
}

/**
 * CASE-MCH-02 · 商家内容优化能力（299=LLM，免费/99=规则建议）
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

  if (active && plan === MERCHANT_PLAN.OPTIMIZE_299) {
    return {
      ...base,
      mode: 'llm',
      llmEnabled: true,
      hint: '深度优化版：可使用 AI 润色（授权前，商家确认后写入相册）',
    }
  }

  if (active && plan === MERCHANT_PLAN.INDEX_99) {
    return {
      ...base,
      hint: '收录版：提供规则建议；升级深度优化版可使用 AI 润色',
    }
  }

  return {
    ...base,
    hint: '免费版：提供规则建议；升级套餐后可解锁更多优化能力',
  }
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

function buildPlanSwitchQuote(subscriptionRow, targetPlan, listPriceCents) {
  const isCurrentPlan =
    subscriptionRow?.plan === targetPlan &&
    isSubscriptionActive(subscriptionRow) &&
    hasPublicIndexEntitlement(subscriptionRow)
  if (isCurrentPlan) {
    return Promise.resolve({
      isCurrentPlan: true,
      creditCents: 0,
      amountCents: 0,
      refundExcessCents: 0,
      creditYuan: '0.00',
      amountYuan: '0.00',
      refundExcessYuan: '0.00',
      summary: '当前套餐',
    })
  }

  return computeRemainingCreditCents(subscriptionRow).then((creditCents) => {
    const applied = Math.min(creditCents, listPriceCents)
    const amountCents = Math.max(0, listPriceCents - applied)
    const refundExcessCents = Math.max(0, creditCents - listPriceCents)
    let summary = ''
    if (creditCents > 0 && amountCents > 0) {
      summary = `剩余权益抵扣 ¥${(applied / 100).toFixed(2)}，实付 ¥${(amountCents / 100).toFixed(2)}`
    } else if (creditCents > 0 && amountCents === 0 && refundExcessCents > 0) {
      summary = `剩余权益 ¥${(creditCents / 100).toFixed(2)}，退回差额 ¥${(refundExcessCents / 100).toFixed(2)}`
    } else if (creditCents > 0 && amountCents === 0) {
      summary = `剩余权益全额抵扣，无需支付`
    }
    return {
      isCurrentPlan: false,
      creditCents,
      amountCents,
      refundExcessCents,
      creditYuan: (creditCents / 100).toFixed(2),
      amountYuan: (amountCents / 100).toFixed(2),
      refundExcessYuan: (refundExcessCents / 100).toFixed(2),
      summary,
    }
  })
}

function computeRenewExpiresAt(currentExpiresAt) {
  const now = new Date()
  const base =
    currentExpiresAt && currentExpiresAt.getTime() > now.getTime()
      ? currentExpiresAt
      : now
  const next = new Date(base)
  next.setDate(next.getDate() + SUBSCRIPTION_TERM_DAYS)
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
    existing.plan === plan &&
    isSubscriptionActive(existing) &&
    existing.expiresAt

  let expiresAt = null
  if (PUBLIC_INDEX_PLANS.has(plan)) {
    expiresAt = isRenewal
      ? computeRenewExpiresAt(existing.expiresAt)
      : computeRenewExpiresAt(null)
  }

  const data = {
    plan,
    status: MERCHANT_SUBSCRIPTION_STATUS.ACTIVE,
    startedAt: isRenewal ? existing.startedAt || now : now,
    expiresAt,
  }

  if (PUBLIC_INDEX_PLANS.has(plan) && !existing.indexingSlaMet) {
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

function listPlanCatalog(subscriptionRow) {
  const testCents = config.wechatPay.subscriptionTestAmountCents
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
    const priceLabel =
      testCents != null && item.plan !== MERCHANT_PLAN.FREE
        ? `测试价 ¥${(testCents / 100).toFixed(2)} / 年`
        : priceCents === item.priceCents
          ? item.priceLabel
          : `¥${(priceCents / 100).toFixed(0)} / 年`
    return {
      ...item,
      priceCents,
      listPriceCents,
      priceLabel,
      paymentTestMode: testCents != null && item.plan !== MERCHANT_PLAN.FREE,
    }
  })
}

async function enrichPlanCatalogWithQuotes(subscriptionRow, plans) {
  const enriched = []
  for (const item of plans) {
    if (item.plan === MERCHANT_PLAN.FREE) {
      enriched.push({ ...item, switchQuote: null })
      continue
    }
    const quote = await buildPlanSwitchQuote(subscriptionRow, item.plan, item.priceCents)
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
    canUpgrade: plan !== MERCHANT_PLAN.OPTIMIZE_299,
  }
  const creditCents = await computeRemainingCreditCents(row)
  subscription.remainingCreditCents = creditCents
  subscription.remainingCreditYuan = (creditCents / 100).toFixed(2)
  const plans = listPlanCatalog(row)
  const plansWithQuotes = await enrichPlanCatalogWithQuotes(row, plans)
  return {
    subscription,
    plans: plansWithQuotes,
    paymentTestMode: config.wechatPay.subscriptionTestAmountCents != null,
    disclaimer:
      '公域自然排序仅依据案例完整度与车主反馈，与是否付费无关。付费仅解锁公域收录权限与页面优化服务，不承诺排名与到店效果。调整套餐时按剩余天数折算未消费金额，差额原路退回或抵扣新套餐。',
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
  computeRemainingCreditCents,
  buildPlanSwitchQuote,
  resolveLastPaidAmountCents,
}
