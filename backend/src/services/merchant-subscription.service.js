/**
 * 商家 SaaS 套餐 · 公域收录 gate（方案 B：生成 H5 但 noindex + 不进 sitemap）
 */
const { prisma } = require('../lib/prisma')
const { newId } = require('../lib/ids')
const { resolveSeoNoindex } = require('../utils/case-article-templates')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const {
  MERCHANT_PLAN,
  MERCHANT_PLAN_LABELS,
  MERCHANT_PLAN_PRICE_CENTS,
  MERCHANT_SUBSCRIPTION_STATUS,
  PUBLIC_INDEX_PLANS,
  SUBSCRIPTION_TERM_DAYS,
  PLAN_CATALOG,
} = require('../constants/merchant-subscription')

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
  let row = await prisma.merchantSubscription.findUnique({
    where: { merchantId },
  })
  if (!row) {
    row = await prisma.merchantSubscription.create({
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

async function merchantHasPublicIndex(merchantId) {
  const row = await getOrCreateSubscription(merchantId)
  return hasPublicIndexEntitlement(row)
}

async function resolveMerchantIdsWithPublicIndex() {
  const now = new Date()
  const rows = await prisma.merchantSubscription.findMany({
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
  if (!PUBLIC_INDEX_PLANS.has(plan) && plan !== MERCHANT_PLAN.FREE) {
    const err = new Error('无效的套餐类型')
    err.status = 400
    throw err
  }

  const existing = await getOrCreateSubscription(merchantId)
  const now = new Date()
  const isRenewal =
    PUBLIC_INDEX_PLANS.has(existing.plan) &&
    isSubscriptionActive(existing) &&
    existing.expiresAt

  let expiresAt = null
  if (PUBLIC_INDEX_PLANS.has(plan)) {
    expiresAt = computeRenewExpiresAt(isRenewal ? existing.expiresAt : null)
  }

  const data = {
    plan,
    status: MERCHANT_SUBSCRIPTION_STATUS.ACTIVE,
    startedAt: existing.startedAt || now,
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

function listPlanCatalog(subscriptionRow) {
  return PLAN_CATALOG.map((item) => {
    const priceCents =
      item.plan === MERCHANT_PLAN.FREE
        ? 0
        : resolvePlanPriceCents(item.plan, subscriptionRow)
    return {
      ...item,
      priceCents,
      priceLabel:
        priceCents === item.priceCents
          ? item.priceLabel
          : `¥${(priceCents / 100).toFixed(0)} / 年`,
    }
  })
}

async function fetchMerchantSubscriptionPanel(auth) {
  const merchantId = auth.merchantId
  const row = await getOrCreateSubscription(merchantId)
  const subscription = formatSubscriptionRow(row)
  return {
    subscription,
    plans: listPlanCatalog(row),
    disclaimer:
      '公域自然排序仅依据案例完整度与车主反馈，与是否付费无关。付费仅解锁公域收录权限与页面优化服务，不承诺排名与到店效果。',
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
  listPlanCatalog,
  fetchMerchantSubscriptionPanel,
  hasPublicIndexEntitlement,
  isSubscriptionActive,
}
