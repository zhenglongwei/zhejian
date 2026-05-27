const { PRICE_MODE } = require('../constants/price-mode')
const { PUBLIC_AUTH_TIER } = require('../constants/case-authorization')

/**
 * 从相册字段解析商家录入的真实方案报价（固定值）
 */
function resolvePlanAmount(source = {}) {
  if (!source || typeof source !== 'object') return null

  const explicit =
    source.planAmount != null
      ? Number(source.planAmount)
      : source.amount != null
        ? Number(source.amount)
        : null
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit)

  const min =
    source.minAmount != null
      ? Number(source.minAmount)
      : source.planMinAmount != null
        ? Number(source.planMinAmount)
        : null
  const max =
    source.maxAmount != null
      ? Number(source.maxAmount)
      : source.planMaxAmount != null
        ? Number(source.planMaxAmount)
        : null

  if (Number.isFinite(min) && Number.isFinite(max)) {
    if (min === max) return Math.round(min)
    return Math.round((min + max) / 2)
  }
  if (Number.isFinite(min) && min > 0) return Math.round(min)
  if (Number.isFinite(max) && max > 0) return Math.round(max)
  return null
}

/**
 * 基于 seed 的确定性伪随机（0～1），同 seed 结果稳定，不同案例不可比对反推
 */
function hashSeed(text) {
  const input = String(text || '')
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededUnit(seed, slot) {
  let t = (seed + Math.imul(slot, 0x6d2b79f5)) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function roundDownToStep(value, step) {
  return Math.max(step, Math.floor(value / step) * step)
}

function roundUpToStep(value, step) {
  return Math.ceil(value / step) * step
}

/**
 * 公开页未获车主授权时的脱敏参考区间（系统计算，商家不可编辑）
 * 基于 albumId/caseId 的确定性伪随机：同案例展示稳定，不同案例区间不可归纳规律
 */
function computePublicPriceRange(planAmount, seedKey = '') {
  const base = Number(planAmount)
  if (!Number.isFinite(base) || base <= 0) {
    return {
      priceMode: PRICE_MODE.RANGE,
      amount: null,
      minAmount: null,
      maxAmount: null,
    }
  }

  const seed = hashSeed(`${seedKey}|${base}`)
  const step = base >= 1000 ? 50 : 10
  const lowFactor = 0.68 + seededUnit(seed, 1) * 0.24
  const highFactor = 1.06 + seededUnit(seed, 2) * 0.26
  const lowJitter = Math.floor(seededUnit(seed, 3) * 5) * step
  const highJitter = Math.floor(seededUnit(seed, 4) * 6) * step

  let minAmount = roundDownToStep(base * lowFactor, step) - lowJitter
  let maxAmount = roundUpToStep(base * highFactor, step) + highJitter
  minAmount = Math.max(step, minAmount)

  const minSpread = Math.max(step * 2, roundUpToStep(base * 0.18, step))
  if (maxAmount <= minAmount) {
    maxAmount = minAmount + minSpread
  }

  return {
    priceMode: PRICE_MODE.RANGE,
    amount: null,
    minAmount,
    maxAmount,
  }
}

function hasUserPublicAuthorization(source = {}) {
  const tier = source.authorizationTier || source.authorization?.tier
  if (tier === PUBLIC_AUTH_TIER.ANONYMOUS || tier === PUBLIC_AUTH_TIER.NAMED) {
    return true
  }
  const status =
    source.authorizationStatus ||
    source.authorization?.status ||
    source.publicCaseStatus
  if (
    status === 'authorized' ||
    status === 'pending_review' ||
    status === 'public_approved'
  ) {
    return Boolean(source.userPhone || source.userId)
  }
  return false
}

/** 商家端 / 车主私密查看 */
function buildPrivateAlbumPrice(source = {}) {
  const amount = resolvePlanAmount(source)
  if (amount == null) {
    return {
      priceMode: '',
      amount: null,
      minAmount: null,
      maxAmount: null,
      planAmount: null,
    }
  }
  return {
    priceMode: PRICE_MODE.FIXED,
    amount,
    minAmount: null,
    maxAmount: null,
    planAmount: amount,
  }
}

/** 公开案例 / H5 公示页 */
function buildPublicCasePrice(source = {}, options = {}) {
  const amount = resolvePlanAmount(source)
  const hasUserAuth =
    options.hasUserAuthorization != null
      ? options.hasUserAuthorization
      : hasUserPublicAuthorization(source)

  if (amount == null) {
    return {
      priceMode: PRICE_MODE.CONSULT,
      amount: null,
      minAmount: null,
      maxAmount: null,
      planAmount: null,
    }
  }

  if (hasUserAuth) {
    return {
      priceMode: PRICE_MODE.FIXED,
      amount,
      minAmount: null,
      maxAmount: null,
      planAmount: amount,
    }
  }

  const seedKey =
    source.albumId || source.caseId || source.id || String(amount)
  const range = computePublicPriceRange(amount, seedKey)
  return {
    ...range,
    planAmount: amount,
  }
}

function normalizePlanAmountPayload(payload = {}) {
  if (payload.planAmount != null && payload.planAmount !== '') {
    const amount = parseInt(String(payload.planAmount), 10)
    if (Number.isFinite(amount) && amount > 0) {
      return {
        ...payload,
        planAmount: amount,
        planMinAmount: amount,
        planMaxAmount: amount,
        priceMode: PRICE_MODE.FIXED,
      }
    }
  }

  const min = parseInt(String(payload.planMinAmount), 10)
  const max = parseInt(String(payload.planMaxAmount), 10)
  if (Number.isFinite(min) && Number.isFinite(max) && min === max) {
    return {
      ...payload,
      planAmount: min,
      planMinAmount: min,
      planMaxAmount: max,
      priceMode: PRICE_MODE.FIXED,
    }
  }
  return payload
}

function formatPlanAmountLabel(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return '—'
  return `¥${amount}`
}

module.exports = {
  resolvePlanAmount,
  computePublicPriceRange,
  hasUserPublicAuthorization,
  buildPrivateAlbumPrice,
  buildPublicCasePrice,
  normalizePlanAmountPayload,
  formatPlanAmountLabel,
}
