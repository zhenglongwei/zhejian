/**
 * 服务方案创建 — 服务类型标签与 catalog 映射
 */
const {
  MERCHANT_SERVICE_TAG_OPTIONS,
  MERCHANT_SERVICE_TAG_NAME_MAX,
} = require('./merchant-service-tags')

const CUSTOM_SERVICE_ITEM_ID = 'item_custom'
const CUSTOM_CATEGORY_ID = 'cat_other'

/** 常见标签 → 平台标准项目 ID（无映射则走自定义） */
const TAG_TO_ITEM_ID = {
  小保养: 'item_maintenance',
  刹车维修: 'item_brake_pad',
  刹车片更换: 'item_brake_pad',
  电瓶更换: 'item_battery',
  钣喷修复: 'item_body_paint',
  事故车维修: 'item_accident',
  事故车维修预约: 'item_accident',
}

function buildServiceTagOptions(catalogItems = []) {
  const names = []
  const seen = new Set()
  const add = (name) => {
    const trimmed = String(name || '').trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    names.push(trimmed)
  }
  MERCHANT_SERVICE_TAG_OPTIONS.forEach(add)
  catalogItems
    .filter((item) => item.id !== CUSTOM_SERVICE_ITEM_ID)
    .forEach((item) => add(item.name))
  return names
}

function buildTagViews(tagOptions, selectedLabel) {
  const selected = String(selectedLabel || '').trim()
  return (tagOptions || []).map((name) => ({
    name,
    selected: name === selected,
  }))
}

function buildMatchedTagViews(matched, selectedLabel) {
  const selected = String(selectedLabel || '').trim()
  return (matched || []).map((entry) => ({
    name: entry.name,
    selected: entry.name === selected,
  }))
}

function extractNameQuery(displayName, storeName) {
  const name = String(displayName || '').trim()
  if (!name) return ''
  const store = String(storeName || '').trim()
  if (store) {
    const suffix = ` · ${store}`
    if (name.endsWith(suffix)) {
      return name.slice(0, -suffix.length).trim()
    }
  }
  if (name.includes('·')) {
    const prefix = name.split('·')[0].trim()
    if (prefix) return prefix
  }
  return name
}

function matchServiceTags(query, tagOptions = [], max = 12) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) {
    return (tagOptions || []).slice(0, max).map((name) => ({ name, score: 0 }))
  }
  return (tagOptions || [])
    .map((name) => {
      const lower = String(name).toLowerCase()
      if (lower === q) return { name, score: 100 }
      if (lower.startsWith(q)) return { name, score: 80 }
      if (lower.includes(q)) return { name, score: 60 }
      return null
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
}

function resolveServiceSelection(label, catalogItems = []) {
  const trimmed = String(label || '').trim()
  if (!trimmed) return null

  const mappedId = TAG_TO_ITEM_ID[trimmed]
  if (mappedId) {
    const item = catalogItems.find((entry) => entry.id === mappedId)
    if (item) {
      return { ...item, label: trimmed }
    }
  }

  const byName = catalogItems.find(
    (entry) => entry.name === trimmed && entry.id !== CUSTOM_SERVICE_ITEM_ID
  )
  if (byName) {
    return { ...byName, label: trimmed }
  }

  return {
    id: CUSTOM_SERVICE_ITEM_ID,
    categoryId: CUSTOM_CATEGORY_ID,
    name: trimmed,
    defaultPriceMode: 'range',
    label: trimmed,
    isCustom: true,
  }
}

function inferCustomLabel(planName, storeName) {
  const name = String(planName || '').trim()
  const store = String(storeName || '').trim()
  if (store) {
    const suffix = ` · ${store}`
    if (name.endsWith(suffix)) {
      return name.slice(0, -suffix.length).trim() || name
    }
  }
  const parts = name.split('·')
  return parts[0].trim() || name
}

function inferSelectionFromPlan(detail, catalogItems = [], storeName = '') {
  if (!detail) return null
  if (detail.serviceItemId === CUSTOM_SERVICE_ITEM_ID) {
    return resolveServiceSelection(
      inferCustomLabel(detail.name, storeName),
      catalogItems
    )
  }
  const item = catalogItems.find((entry) => entry.id === detail.serviceItemId)
  if (item) {
    const options = buildServiceTagOptions(catalogItems)
    const label =
      options.find((tag) => {
        const resolved = resolveServiceSelection(tag, catalogItems)
        return resolved && resolved.id === item.id
      }) || item.name
    return { ...item, label }
  }
  return resolveServiceSelection(detail.name, catalogItems)
}

module.exports = {
  CUSTOM_SERVICE_ITEM_ID,
  CUSTOM_CATEGORY_ID,
  MERCHANT_SERVICE_TAG_NAME_MAX,
  buildServiceTagOptions,
  buildTagViews,
  buildMatchedTagViews,
  extractNameQuery,
  matchServiceTags,
  resolveServiceSelection,
  inferCustomLabel,
  inferSelectionFromPlan,
}
