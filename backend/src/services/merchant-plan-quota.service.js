/**
 * 商家双额度：AI 分析（一本相册成功用过即占 1）/ 公开托管（首次上店页占 1）
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

function albumConsumesAiQuota(album) {
  const pkg = readPkg(album)
  if (pkg.quotaMeta && pkg.quotaMeta.aiAnalysisConsumedAt) return true
  const nodes = Array.isArray(pkg.flowNodes) ? pkg.flowNodes : []
  return nodes.some((node) => {
    if (!node || typeof node !== 'object') return false
    if (node.intakeAdvice && node.intakeAdvice.status === 'ready') return true
    if (node.stepAdvice && node.stepAdvice.status === 'ready') return true
    if (node.deliveryAdvice && node.deliveryAdvice.status === 'ready') return true
    if (node.workAdvice && node.workAdvice.status === 'ready') return true
    if (node.aiReview && node.aiReview.status === 'ready') return true
    return false
  })
}

function albumConsumesPublicHostQuota(album) {
  const pkg = readPkg(album)
  if (pkg.quotaMeta && pkg.quotaMeta.publicHostConsumedAt) return true
  const hm = pkg.hostMeta && typeof pkg.hostMeta === 'object' ? pkg.hostMeta : {}
  if (hm.visibility === 'public') return true
  if (hm.publicPublishStage === 'published') return true
  if (hm.onPublicWeb) return true
  return false
}

async function listMerchantAlbumsForQuota(merchantId) {
  const id = String(merchantId || '').trim()
  if (!id) return []
  return prisma.album.findMany({
    where: { merchantId: id },
    select: { id: true, contentPackageJson: true },
  })
}

async function countAiAnalysisOccupied(merchantId) {
  const albums = await listMerchantAlbumsForQuota(merchantId)
  return albums.filter(albumConsumesAiQuota).length
}

async function countPublicHostOccupied(merchantId) {
  const albums = await listMerchantAlbumsForQuota(merchantId)
  return albums.filter(albumConsumesPublicHostQuota).length
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

async function markAlbumAiAnalysisConsumed(albumId) {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    select: { id: true, contentPackageJson: true },
  })
  if (!album) return false
  if (albumConsumesAiQuota(album) && readPkg(album).quotaMeta?.aiAnalysisConsumedAt) {
    return false
  }
  if (readPkg(album).quotaMeta?.aiAnalysisConsumedAt) return false
  await patchAlbumQuotaMeta(albumId, {
    aiAnalysisConsumedAt: new Date().toISOString(),
  })
  return true
}

async function markAlbumPublicHostConsumed(albumId) {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    select: { id: true, contentPackageJson: true },
  })
  if (!album) return false
  if (readPkg(album).quotaMeta?.publicHostConsumedAt) return false
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
  const album =
    albumId &&
    (await prisma.album.findUnique({
      where: { id: albumId },
      select: { id: true, contentPackageJson: true },
    }))
  if (album && albumConsumesAiQuota(album)) {
    return { ok: true, alreadyConsumed: true }
  }
  const effectivePlan = await resolveEffectivePlanForMerchant(merchantId)
  const limit = caseQuotaForPlan(effectivePlan)
  const used = await countAiAnalysisOccupied(merchantId)
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
  const album =
    albumId &&
    (await prisma.album.findUnique({
      where: { id: albumId },
      select: { id: true, contentPackageJson: true },
    }))
  if (album && albumConsumesPublicHostQuota(album)) {
    return { ok: true, alreadyConsumed: true }
  }
  const effectivePlan = await resolveEffectivePlanForMerchant(merchantId)
  const limit = caseQuotaForPlan(effectivePlan)
  const used = await countPublicHostOccupied(merchantId)
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
  const plan = effectivePlan || (await resolveEffectivePlanForMerchant(merchantId))
  const limit = caseQuotaForPlan(plan)
  const [usedAiQuota, usedPublicHostQuota] = await Promise.all([
    countAiAnalysisOccupied(merchantId),
    countPublicHostOccupied(merchantId),
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
  countAiAnalysisOccupied,
  countPublicHostOccupied,
  countOccupiedCases,
  markAlbumAiAnalysisConsumed,
  markAlbumPublicHostConsumed,
  assertAiAnalysisQuotaAvailable,
  assertPublicHostQuotaAvailable,
  getMerchantQuotaSnapshot,
}
