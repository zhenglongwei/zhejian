/**
 * 服务类目检测清单 · 配置与合并（卷十五）
 * 内容真源：docs/04_维修过程相册/17_服务类目检测清单.md
 */
const { CATALOG_VERSION, CATEGORIES } = require('./service-checklist-catalog-data')
const { getWorkFollowUps } = require('./service-checklist-work-followups')

const CHASSIS_KEYWORDS = [
  '异响',
  '胶套',
  '摆臂',
  '球头',
  '底盘异响',
  '减震',
  '连杆',
  '底盘维修',
  '底盘',
]

function listCategoryIds() {
  return Object.keys(CATEGORIES)
}

function getRawCategory(categoryId) {
  const key = String(categoryId || '').trim()
  return CATEGORIES[key] || null
}

function decorateItem(def, categoryId) {
  const suggestStageId = def.suggestStageId || 'stage_2'
  const workOnly = suggestStageId === 'stage_5' || Boolean(def.workOnly)
  const workFollowUpKeys = getWorkFollowUps(categoryId, def.itemKey)
  return {
    ...def,
    suggestStageId,
    workOnly,
    workFollowUpKeys,
  }
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
      items: (raw.items || []).map((it) => decorateItem(it, raw.categoryId)),
    }
  }
  const parent = resolveCategoryItems(parentId)
  const byKey = new Map()
  parent.items.forEach((it) => byKey.set(it.itemKey, { ...it }))
  ;(raw.items || []).forEach((it) => byKey.set(it.itemKey, decorateItem(it, raw.categoryId)))
  // 继承项也要挂上本类目（或父类目）的 follow-ups：大保沿用小保 old_oil 映射
  const items = Array.from(byKey.values()).map((it) => {
    const fromChild = getWorkFollowUps(raw.categoryId, it.itemKey)
    const fromParent = getWorkFollowUps(parentId, it.itemKey)
    const workFollowUpKeys = fromChild.length ? fromChild : fromParent
    const workOnly = it.suggestStageId === 'stage_5' || Boolean(it.workOnly)
    return { ...it, workOnly, workFollowUpKeys }
  })
  return {
    categoryId: raw.categoryId,
    label: raw.label,
    items,
  }
}

/** 与相册节点模板关键词对齐（见 service-album-node-template KEYWORD_TEMPLATE_RULES） */
const SERVICE_NAME_CATEGORY_RULES = [
  { categoryId: 'major_maintenance', keywords: ['大保养', '火花塞', '变速箱油', '刹车油'] },
  { categoryId: 'maintenance', keywords: ['机油', '机滤', '小保养', '保养'] },
  { categoryId: 'brake', keywords: ['刹车片', '刹车盘', '刹车异响', '刹车'] },
  { categoryId: 'battery', keywords: ['电瓶', '蓄电池', '无法启动'] },
  { categoryId: 'tire', keywords: ['轮胎', '换胎', '补胎', '动平衡'] },
  { categoryId: 'ac', keywords: ['空调', '冷媒', '滤芯', '异味'] },
  { categoryId: 'body_paint', keywords: ['钣金', '喷漆', '划痕', '凹陷', '补漆', '钣喷'] },
  { categoryId: 'accident', keywords: ['事故', '碰撞', '定损'] },
]

function resolveCategoryIdFromAlbum({ templateId, serviceName } = {}) {
  const tpl = String(templateId || '').trim()
  if (tpl && CATEGORIES[tpl]) return tpl
  const name = String(serviceName || '').replace(/\s/g, '')
  if (CHASSIS_KEYWORDS.some((k) => name.includes(k))) return 'chassis_noise'
  for (const rule of SERVICE_NAME_CATEGORY_RULES) {
    if (rule.keywords.some((kw) => name.includes(kw))) return rule.categoryId
  }
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
  getWorkFollowUps,
}
