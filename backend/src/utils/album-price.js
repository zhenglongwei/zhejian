const PUBLIC_AUTH_TIER = {
  ANONYMOUS: 'anonymous',
  NAMED: 'named',
}

const PRICE_MODE = {
  FIXED: 'fixed',
  RANGE: 'range',
  CONSULT: 'consult',
}

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
    return true
  }
  return false
}

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

function buildPublicCaseDbPriceColumns(draft = {}) {
  const amount = draft.amount ?? draft.planAmount
  if (draft.priceMode === PRICE_MODE.FIXED && amount != null) {
    const value = Math.round(Number(amount))
    return {
      priceMode: PRICE_MODE.FIXED,
      minAmount: value,
      maxAmount: value,
    }
  }
  return {
    priceMode: draft.priceMode || PRICE_MODE.RANGE,
    minAmount: draft.minAmount ?? null,
    maxAmount: draft.maxAmount ?? null,
  }
}

function resolvePublicCasePriceFields(row = {}, album = null) {
  const { extractSnapshotFromContentJson } = require('../schemas/case-snapshot.schema')
  const snapshot = extractSnapshotFromContentJson(row.contentJson)
  if (snapshot) {
    const tier = row.authorizationTier || snapshot.authorizationTier || PUBLIC_AUTH_TIER.NAMED
    const hasUserAuth =
      tier === PUBLIC_AUTH_TIER.ANONYMOUS || tier === PUBLIC_AUTH_TIER.NAMED
    const price = snapshot.price && typeof snapshot.price === 'object' ? snapshot.price : null
    const planAmount = price?.planAmount ?? snapshot.planAmount ?? null
    const minAmount = price?.minAmount ?? row.minAmount ?? null
    const maxAmount = price?.maxAmount ?? row.maxAmount ?? null
    const amount = price?.amount ?? null
    const priceMode = price?.priceMode || row.priceMode || ''

    if (priceMode === PRICE_MODE.FIXED || (amount != null && amount > 0)) {
      return buildPublicCasePrice(
        {
          id: row.id,
          albumId: row.albumId,
          authorizationTier: tier,
          planAmount: planAmount ?? amount,
          amount: amount ?? planAmount,
        },
        { hasUserAuthorization: hasUserAuth }
      )
    }

    if (minAmount != null && maxAmount != null) {
      return buildPublicCasePrice(
        {
          id: row.id,
          albumId: row.albumId,
          authorizationTier: tier,
          minAmount,
          maxAmount,
          planAmount: planAmount ?? minAmount,
        },
        { hasUserAuthorization: hasUserAuth }
      )
    }

    if (planAmount != null && planAmount > 0) {
      return buildPublicCasePrice(
        {
          id: row.id,
          albumId: row.albumId,
          authorizationTier: tier,
          planAmount,
          amount: planAmount,
        },
        { hasUserAuthorization: hasUserAuth }
      )
    }
  }

  const tier = row.authorizationTier || PUBLIC_AUTH_TIER.NAMED
  const hasUserAuth =
    tier === PUBLIC_AUTH_TIER.ANONYMOUS || tier === PUBLIC_AUTH_TIER.NAMED
  const albumAmount = album ? resolvePlanAmount(album) : null
  const minAmount = row.minAmount != null ? Number(row.minAmount) : null
  const maxAmount = row.maxAmount != null ? Number(row.maxAmount) : null
  const rowMode = row.priceMode || ''

  const rowFixed =
    rowMode === PRICE_MODE.FIXED ||
    (minAmount != null && maxAmount != null && minAmount === maxAmount)

  if (rowFixed) {
    const amount = minAmount ?? maxAmount ?? albumAmount
    if (amount != null && amount > 0) {
      return buildPublicCasePrice(
        {
          id: row.id,
          albumId: row.albumId,
          authorizationTier: tier,
          planAmount: amount,
          amount,
        },
        { hasUserAuthorization: hasUserAuth }
      )
    }
  }

  if (minAmount != null && maxAmount != null && minAmount !== maxAmount) {
    return buildPublicCasePrice(
      {
        id: row.id,
        albumId: row.albumId,
        authorizationTier: tier,
        minAmount,
        maxAmount,
        planAmount: albumAmount ?? minAmount,
      },
      { hasUserAuthorization: hasUserAuth }
    )
  }

  return buildPublicCasePrice(
    {
      id: row.id,
      albumId: row.albumId,
      authorizationTier: tier,
      planAmount: albumAmount,
      minAmount: album?.minAmount,
      maxAmount: album?.maxAmount,
      priceMode: album?.priceMode,
    },
    { hasUserAuthorization: hasUserAuth }
  )
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
  buildPublicCaseDbPriceColumns,
  resolvePublicCasePriceFields,
  normalizePlanAmountPayload,
  formatPlanAmountLabel,
}
