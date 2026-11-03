/**
 * 商家四档目录价 + 门店特价
 * 真源：docs/03_商家端/05_商家套餐与权益.md
 */
const { prisma, assertPrismaDelegate } = require('../lib/prisma')
const {
  MERCHANT_PLAN_ORDER,
  DEFAULT_PLAN_CATALOG,
  CATALOG_SETTING_KEY,
  FEATURE_ROWS,
  yuanLabelFromCents,
  isSellablePlanCode,
} = require('../constants/merchant-plan-catalog')

function settingRepo() {
  return prisma.platformSetting || null
}

function assertSettingPrismaReady() {
  assertPrismaDelegate('platformSetting', 'platform_settings')
}

function normalizePriceCents(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

function yuanToCents(yuan) {
  if (yuan == null || yuan === '') return null
  const n = Number(yuan)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

function readOverrides(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const out = {}
  MERCHANT_PLAN_ORDER.forEach((code) => {
    const cents = normalizePriceCents(src[code])
    if (cents != null) out[code] = cents
  })
  return out
}

function mergeCatalogPrices(stored = {}) {
  const out = {}
  MERCHANT_PLAN_ORDER.forEach((code) => {
    const base = DEFAULT_PLAN_CATALOG[code]
    const override = normalizePriceCents(stored[code])
    out[code] = {
      ...base,
      priceCents: override != null ? override : base.priceCents,
    }
  })
  return out
}

async function loadCatalogPriceMap() {
  if (!settingRepo()) return mergeCatalogPrices({})
  try {
    assertSettingPrismaReady()
    const row = await prisma.platformSetting.findUnique({
      where: { key: CATALOG_SETTING_KEY },
    })
    const value = row && row.valueJson && typeof row.valueJson === 'object' ? row.valueJson : {}
    return mergeCatalogPrices(value)
  } catch (e) {
    console.warn('[plan-pricing] load catalog', e && e.message)
    return mergeCatalogPrices({})
  }
}

async function saveCatalogPriceMap(input = {}) {
  assertSettingPrismaReady()
  const next = {}
  MERCHANT_PLAN_ORDER.forEach((code) => {
    const cents =
      normalizePriceCents(input[code]) != null
        ? normalizePriceCents(input[code])
        : yuanToCents(input[`${code}Yuan`])
    if (cents != null) next[code] = cents
  })
  const merged = mergeCatalogPrices(next)
  const valueJson = {}
  MERCHANT_PLAN_ORDER.forEach((code) => {
    valueJson[code] = merged[code].priceCents
  })
  await prisma.platformSetting.upsert({
    where: { key: CATALOG_SETTING_KEY },
    create: { key: CATALOG_SETTING_KEY, valueJson },
    update: { valueJson },
  })
  return merged
}

async function loadStoreOverrides(storeId) {
  const id = String(storeId || '').trim()
  if (!id) return {}
  try {
    const store = await prisma.store.findUnique({
      where: { id },
      select: { planPriceOverridesJson: true },
    })
    return readOverrides(store && store.planPriceOverridesJson)
  } catch (e) {
    console.warn('[plan-pricing] load store overrides', e && e.message)
    return {}
  }
}

async function saveStoreOverrides(storeId, input = {}) {
  const id = String(storeId || '').trim()
  if (!id) {
    const err = new Error('缺少门店')
    err.status = 400
    throw err
  }
  const asCents = String(input.unit || '').toLowerCase() === 'cents'
  const next = {}
  MERCHANT_PLAN_ORDER.forEach((code) => {
    if (
      !Object.prototype.hasOwnProperty.call(input, code) &&
      !Object.prototype.hasOwnProperty.call(input, `${code}Yuan`)
    ) {
      return
    }
    const raw = Object.prototype.hasOwnProperty.call(input, code)
      ? input[code]
      : input[`${code}Yuan`]
    if (raw === '' || raw == null) return
    const cents = asCents ? normalizePriceCents(raw) : yuanToCents(raw)
    if (cents != null) next[code] = cents
  })
  await prisma.store.update({
    where: { id },
    data: { planPriceOverridesJson: next },
  })
  return next
}

function buildPlanColumns(catalogMap, overrides = {}, currentPlanCode = '') {
  return MERCHANT_PLAN_ORDER.map((code) => {
    const base = catalogMap[code] || DEFAULT_PLAN_CATALOG[code]
    const special = normalizePriceCents(overrides[code])
    const priceCents = special != null ? special : base.priceCents
    return {
      planCode: code,
      name: base.name,
      albumLabel: '不限',
      caseQuota: base.caseQuota,
      caseQuotaLabel: base.caseQuotaLabel,
      aiQuota: base.aiQuota,
      aiQuotaLabel: base.aiQuotaLabel,
      publicHostQuota: base.publicHostQuota,
      publicHostQuotaLabel: base.publicHostQuotaLabel,
      catalogPriceCents: base.priceCents,
      priceCents,
      priceLabel: yuanLabelFromCents(priceCents),
      hasSpecialPrice: special != null,
      current: Boolean(currentPlanCode) && currentPlanCode === code,
    }
  })
}

function buildPricingTable(columns) {
  return {
    columns,
    rows: FEATURE_ROWS.map((row) => ({
      key: row.key,
      label: row.label,
      cells: columns.map((col) => {
        if (row.key === 'album') return col.albumLabel
        if (row.key === 'ai') return col.aiQuotaLabel || col.caseQuotaLabel
        if (row.key === 'publicHost') return col.publicHostQuotaLabel || col.caseQuotaLabel
        if (row.key === 'caseHost') return col.caseQuotaLabel
        return col.priceLabel
      }),
    })),
  }
}

async function resolvePricingTableForStore(storeId, currentPlanCode = '') {
  const catalogMap = await loadCatalogPriceMap()
  const overrides = await loadStoreOverrides(storeId)
  const columns = buildPlanColumns(catalogMap, overrides, currentPlanCode)
  return {
    catalog: MERCHANT_PLAN_ORDER.map((code) => ({
      planCode: code,
      name: catalogMap[code].name,
      priceCents: catalogMap[code].priceCents,
      priceLabel: yuanLabelFromCents(catalogMap[code].priceCents),
      caseQuotaLabel: catalogMap[code].caseQuotaLabel,
    })),
    overrides,
    pricingTable: buildPricingTable(columns),
    columns,
  }
}

async function getAdminCatalogPricing() {
  const catalogMap = await loadCatalogPriceMap()
  return {
    plans: MERCHANT_PLAN_ORDER.map((code) => ({
      planCode: code,
      name: catalogMap[code].name,
      caseQuotaLabel: catalogMap[code].caseQuotaLabel,
      albumLabel: '不限',
      priceCents: catalogMap[code].priceCents,
      priceYuan: catalogMap[code].priceCents / 100,
      priceLabel: yuanLabelFromCents(catalogMap[code].priceCents),
    })),
  }
}

async function updateAdminCatalogPricing(body = {}) {
  const input = {}
  MERCHANT_PLAN_ORDER.forEach((code) => {
    if (body[code] != null) input[code] = body[code]
    if (body.prices && body.prices[code] != null) input[code] = body.prices[code]
    if (body.yuan && body.yuan[code] != null) input[`${code}Yuan`] = body.yuan[code]
  })
  const merged = await saveCatalogPriceMap(input)
  return {
    plans: MERCHANT_PLAN_ORDER.map((code) => ({
      planCode: code,
      name: merged[code].name,
      caseQuotaLabel: merged[code].caseQuotaLabel,
      albumLabel: '不限',
      priceCents: merged[code].priceCents,
      priceYuan: merged[code].priceCents / 100,
      priceLabel: yuanLabelFromCents(merged[code].priceCents),
    })),
  }
}

async function getAdminStorePricing(storeId) {
  const resolved = await resolvePricingTableForStore(storeId)
  return {
    storeId: String(storeId || ''),
    catalog: resolved.catalog,
    overrides: resolved.overrides,
    columns: resolved.columns,
  }
}

async function updateAdminStorePricing(storeId, body = {}) {
  const input = body.prices || body.overrides || body
  const overrides = await saveStoreOverrides(storeId, input)
  const resolved = await resolvePricingTableForStore(storeId)
  return {
    storeId: String(storeId || ''),
    overrides,
    columns: resolved.columns,
  }
}

module.exports = {
  isSellablePlanCode,
  loadCatalogPriceMap,
  saveCatalogPriceMap,
  loadStoreOverrides,
  saveStoreOverrides,
  resolvePricingTableForStore,
  getAdminCatalogPricing,
  updateAdminCatalogPricing,
  getAdminStorePricing,
  updateAdminStorePricing,
  yuanToCents,
  yuanLabelFromCents,
}
