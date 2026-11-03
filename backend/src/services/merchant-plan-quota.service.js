/**
 * 商家双额度（按计费周期）：AI 分析 / 公开托管
 * 真源：docs/03_商家端/05_商家套餐与权益.md
 */
const { prisma } = require('../lib/prisma')
const {
  caseQuotaForPlan,
} = require('../constants/merchant-subscription')

function readPkg(album) {
  const pkg = album && album.contentPackageJson
  return pkg && typeof pkg === 'object' ? pkg : {}
}

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function isTimestampInPeriod(isoOrDate, startedAt, expiresAt) {
  const t = toDate(isoOrDate)
  const start = toDate(startedAt)
  const end = toDate(expiresAt)
  if (!t || !start || !end) return false
  const ms = t.getTime()
  return ms >= start.getTime() && ms <= end.getTime()
}

/** 仅认本周期内写下的占用时刻；上周期/无时刻的老痕迹不占本周期 */
function albumConsumesAiQuotaInPeriod(album, period) {
  if (!period || !period.startedAt || !period.expiresAt) return false
  const pkg = readPkg(album)
  const at = pkg.quotaMeta && pkg.quotaMeta.aiAnalysisConsumedAt
  return isTimestampInPeriod(at, period.startedAt, period.expiresAt)
}

function albumConsumesPublicHostQuotaInPeriod(album, period) {
  if (!period || !period.startedAt || !period.expiresAt) return false
  const pkg = readPkg(album)
  const at = pkg.quotaMeta && pkg.quotaMeta.publicHostConsumedAt
  return isTimestampInPeriod(at, period.startedAt, period.expiresAt)
}

/** @deprecated 终身累计语义已废止；无周期时返回 false */
function albumConsumesAiQuota(album) {
  const pkg = readPkg(album)
  return Boolean(pkg.quotaMeta && pkg.quotaMeta.aiAnalysisConsumedAt)
}

/** @deprecated 终身累计语义已废止；无周期时返回 false */
function albumConsumesPublicHostQuota(album) {
  const pkg = readPkg(album)
  return Boolean(pkg.quotaMeta && pkg.quotaMeta.publicHostConsumedAt)
}

async function resolveBillingPeriod(merchantId) {
  const {
    getOrCreateSubscription,
    isSubscriptionActive,
  } = require('./merchant-subscription.service')
  const row = await getOrCreateSubscription(merchantId)
  if (!isSubscriptionActive(row) || !row.startedAt || !row.expiresAt) {
    return null
  }
  return {
    startedAt: row.startedAt,
    expiresAt: row.expiresAt,
    plan: row.plan,
  }
}

async function listMerchantAlbumsForQuota(merchantId) {
  const id = String(merchantId || '').trim()
  if (!id) return []
  return prisma.album.findMany({
    where: { merchantId: id },
    select: { id: true, contentPackageJson: true },
  })
}

async function countAiAnalysisOccupied(merchantId, period) {
  const billing = period || (await resolveBillingPeriod(merchantId))
  if (!billing) return 0
  const albums = await listMerchantAlbumsForQuota(merchantId)
  return albums.filter((a) => albumConsumesAiQuotaInPeriod(a, billing)).length
}

async function countPublicHostOccupied(merchantId, period) {
  const billing = period || (await resolveBillingPeriod(merchantId))
  if (!billing) return 0
  const albums = await listMerchantAlbumsForQuota(merchantId)
  return albums.filter((a) => albumConsumesPublicHostQuotaInPeriod(a, billing)).length
}

/** @deprecated 旧单额度；改为 AI+公开托管分开 */
async function countOccupiedCases(merchantId) {
  return countPublicHostOccupied(merchantId)
}

async function patchAlbumQuotaMeta(albumId, patch) {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    select: { contentPackageJson: true },
  })
  if (!album) return null
  const pkg = readPkg(album)
  const quotaMeta = {
    ...(pkg.quotaMeta && typeof pkg.quotaMeta === 'object' ? pkg.quotaMeta : {}),
    ...patch,
  }
  const nextPkg = { ...pkg, quotaMeta }
  await prisma.album.update({
    where: { id: albumId },
    data: { contentPackageJson: nextPkg },
  })
  return quotaMeta
}

async function markAlbumAiAnalysisConsumed(albumId, merchantId = '') {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    select: { id: true, merchantId: true, contentPackageJson: true },
  })
  if (!album) return false
  const mid = merchantId || album.merchantId
  const period = mid ? await resolveBillingPeriod(mid) : null
  if (!period) return false
  if (albumConsumesAiQuotaInPeriod(album, period)) return false
  await patchAlbumQuotaMeta(albumId, {
    aiAnalysisConsumedAt: new Date().toISOString(),
  })
  return true
}

async function markAlbumPublicHostConsumed(albumId, merchantId = '') {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    select: { id: true, merchantId: true, contentPackageJson: true },
  })
  if (!album) return false
  const mid = merchantId || album.merchantId
  const period = mid ? await resolveBillingPeriod(mid) : null
  if (!period) return false
  if (albumConsumesPublicHostQuotaInPeriod(album, period)) return false
  await patchAlbumQuotaMeta(albumId, {
    publicHostConsumedAt: new Date().toISOString(),
  })
  return true
}

async function resolveEffectivePlanForMerchant(merchantId) {
  const {
    getOrCreateSubscription,
    resolveEffectivePlan,
  } = require('./merchant-subscription.service')
  const row = await getOrCreateSubscription(merchantId)
  return resolveEffectivePlan(row)
}

async function assertAiAnalysisQuotaAvailable(merchantId, albumId = '') {
  const period = await resolveBillingPeriod(merchantId)
  if (!period) {
    const err = new Error('套餐已到期，请开通后再分析')
    err.status = 402
    err.code = 'SUBSCRIPTION_EXPIRED'
    throw err
  }
  const album =
    albumId &&
    (await prisma.album.findUnique({
      where: { id: albumId },
      select: { id: true, contentPackageJson: true },
    }))
  if (album && albumConsumesAiQuotaInPeriod(album, period)) {
    return { ok: true, alreadyConsumed: true }
  }
  const effectivePlan = await resolveEffectivePlanForMerchant(merchantId)
  const limit = caseQuotaForPlan(effectivePlan)
  if (limit <= 0) {
    const err = new Error('套餐已到期，请开通后再分析')
    err.status = 402
    err.code = 'SUBSCRIPTION_EXPIRED'
    throw err
  }
  const used = await countAiAnalysisOccupied(merchantId, period)
  if (used >= limit) {
    const err = new Error('AI额度已满，请升级套餐后再分析')
    err.status = 409
    err.code = 'AI_QUOTA_EXCEEDED'
    err.data = { usedAiQuota: used, aiQuotaLimit: limit, effectivePlan }
    throw err
  }
  return { ok: true, usedAiQuota: used, aiQuotaLimit: limit, effectivePlan }
}

async function assertPublicHostQuotaAvailable(merchantId, albumId = '') {
  const period = await resolveBillingPeriod(merchantId)
  if (!period) {
    const err = new Error('套餐已到期，请开通后再公开')
    err.status = 402
    err.code = 'SUBSCRIPTION_EXPIRED'
    throw err
  }
  const album =
    albumId &&
    (await prisma.album.findUnique({
      where: { id: albumId },
      select: { id: true, contentPackageJson: true },
    }))
  if (album && albumConsumesPublicHostQuotaInPeriod(album, period)) {
    return { ok: true, alreadyConsumed: true }
  }
  const effectivePlan = await resolveEffectivePlanForMerchant(merchantId)
  const limit = caseQuotaForPlan(effectivePlan)
  if (limit <= 0) {
    const err = new Error('套餐已到期，请开通后再公开')
    err.status = 402
    err.code = 'SUBSCRIPTION_EXPIRED'
    throw err
  }
  const used = await countPublicHostOccupied(merchantId, period)
  if (used >= limit) {
    const err = new Error('托管额度已满，请升级套餐后再公开')
    err.status = 409
    err.code = 'PUBLIC_HOST_QUOTA_EXCEEDED'
    err.data = {
      usedPublicHostQuota: used,
      publicHostQuotaLimit: limit,
      effectivePlan,
    }
    throw err
  }
  return {
    ok: true,
    usedPublicHostQuota: used,
    publicHostQuotaLimit: limit,
    effectivePlan,
  }
}

async function getMerchantQuotaSnapshot(merchantId, effectivePlan) {
  const plan =
    effectivePlan === undefined
      ? await resolveEffectivePlanForMerchant(merchantId)
      : effectivePlan
  const limit = caseQuotaForPlan(plan)
  const period = await resolveBillingPeriod(merchantId)
  if (!period || limit <= 0) {
    return {
      effectivePlan: plan,
      usedAiQuota: 0,
      aiQuotaLimit: limit,
      usedPublicHostQuota: 0,
      publicHostQuotaLimit: limit,
      usedQuota: 0,
      quotaLimit: limit,
    }
  }
  const [usedAiQuota, usedPublicHostQuota] = await Promise.all([
    countAiAnalysisOccupied(merchantId, period),
    countPublicHostOccupied(merchantId, period),
  ])
  return {
    effectivePlan: plan,
    usedAiQuota,
    aiQuotaLimit: limit,
    usedPublicHostQuota,
    publicHostQuotaLimit: limit,
    /** 兼容旧字段 */
    usedQuota: usedAiQuota,
    quotaLimit: limit,
  }
}

module.exports = {
  albumConsumesAiQuota,
  albumConsumesPublicHostQuota,
  albumConsumesAiQuotaInPeriod,
  albumConsumesPublicHostQuotaInPeriod,
  isTimestampInPeriod,
  resolveBillingPeriod,
  countAiAnalysisOccupied,
  countPublicHostOccupied,
  countOccupiedCases,
  markAlbumAiAnalysisConsumed,
  markAlbumPublicHostConsumed,
  assertAiAnalysisQuotaAvailable,
  assertPublicHostQuotaAvailable,
  getMerchantQuotaSnapshot,
}
