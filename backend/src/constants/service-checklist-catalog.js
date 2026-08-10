/**
 * 服务类目检测清单 · 配置与合并（卷十五）
 * 内容真源：docs/04_维修过程相册/17_服务类目检测清单.md
 */
const { CATALOG_VERSION, CATEGORIES } = require('./service-checklist-catalog-data')

const CHASSIS_KEYWORDS = ['异响', '胶套', '摆臂', '球头', '底盘异响', '减震', '连杆']

function listCategoryIds() {
  return Object.keys(CATEGORIES)
}

function getRawCategory(categoryId) {
  const key = String(categoryId || '').trim()
  return CATEGORIES[key] || null
}

/** 合并继承：大保 = 小保全量 + 增量（同 itemKey 以子类覆盖） */
function resolveCategoryItems(categoryId) {
  const raw = getRawCategory(categoryId) || getRawCategory('default')
  if (!raw) return { categoryId: 'default', label: '通用', items: [] }
  const parentId = raw.inheritsFrom
  if (!parentId) {
    return {
      categoryId: raw.categoryId,
      label: raw.label,
      items: (raw.items || []).map((it) => ({ ...it })),
    }
  }
  const parent = resolveCategoryItems(parentId)
  const byKey = new Map()
  parent.items.forEach((it) => byKey.set(it.itemKey, { ...it }))
  ;(raw.items || []).forEach((it) => byKey.set(it.itemKey, { ...it }))
  return {
    categoryId: raw.categoryId,
    label: raw.label,
    items: Array.from(byKey.values()),
  }
}

function resolveCategoryIdFromAlbum({ templateId, serviceName } = {}) {
  const tpl = String(templateId || '').trim()
  if (tpl && CATEGORIES[tpl]) return tpl
  const name = String(serviceName || '')
  if (CHASSIS_KEYWORDS.some((k) => name.includes(k))) return 'chassis_noise'
  if (CATEGORIES[tpl]) return tpl
  return 'default'
}

function buildEmptyChecklistState(categoryId) {
  const resolved = resolveCategoryItems(categoryId)
  return {
    catalogVersion: CATALOG_VERSION,
    categoryId: resolved.categoryId,
    items: resolved.items.map((def) => ({
      itemKey: def.itemKey,
      status: 'pending',
      outcome: null,
      note: '',
      imageIds: [],
    })),
  }
}

module.exports = {
  CATALOG_VERSION,
  CATEGORIES,
  listCategoryIds,
  getRawCategory,
  resolveCategoryItems,
  resolveCategoryIdFromAlbum,
  buildEmptyChecklistState,
}
