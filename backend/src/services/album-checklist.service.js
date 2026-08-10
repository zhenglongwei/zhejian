/**
 * 相册软清单运行时：水合、挂图同步、车主真实作业清单、outcome
 */
const {
  CATALOG_VERSION,
  resolveCategoryIdFromAlbum,
  resolveCategoryItems,
  buildEmptyChecklistState,
} = require('../constants/service-checklist-catalog')

const OUTCOMES = new Set([
  'observed',
  'recommend_replace',
  'replaced',
  'not_replaced',
  'repaired_other',
])

const OUTCOME_LABELS = {
  observed: '已检查',
  recommend_replace: '建议更换',
  replaced: '已更换',
  not_replaced: '建议更换 · 本次未更换',
  repaired_other: '已处理',
}

function normalizeOutcome(value) {
  const v = String(value || '').trim()
  return OUTCOMES.has(v) ? v : null
}

function parseChecklistJson(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (!Array.isArray(raw.items)) return null
  return raw
}

function hydrateChecklistState(album = {}) {
  const existing = parseChecklistJson(album.checklistJson)
  const categoryId = resolveCategoryIdFromAlbum({
    templateId: album.templateId,
    serviceName: album.serviceName,
  })
  const resolved = resolveCategoryItems(categoryId)
  const prevByKey = new Map()
  if (existing && Array.isArray(existing.items)) {
    existing.items.forEach((it) => {
      if (it && it.itemKey) prevByKey.set(String(it.itemKey), it)
    })
  }
  const items = resolved.items.map((def) => {
    const prev = prevByKey.get(def.itemKey) || {}
    const imageIds = Array.isArray(prev.imageIds)
      ? prev.imageIds.map(String).filter(Boolean)
      : []
    const note = String(prev.note || '').trim()
    let status = String(prev.status || 'pending')
    if (status !== 'skipped' && (imageIds.length || note)) status = 'active'
    if (!['pending', 'active', 'skipped'].includes(status)) status = 'pending'
    return {
      itemKey: def.itemKey,
      status,
      outcome: normalizeOutcome(prev.outcome),
      note,
      imageIds,
    }
  })
  return {
    catalogVersion: CATALOG_VERSION,
    categoryId: resolved.categoryId,
    items,
  }
}

/** 根据图片 checklistItemKey 回填 imageIds，并刷新 active */
function syncChecklistImageLinks(checklistState, images = []) {
  const state = {
    catalogVersion: checklistState.catalogVersion || CATALOG_VERSION,
    categoryId: checklistState.categoryId,
    items: (checklistState.items || []).map((it) => ({
      ...it,
      imageIds: [],
    })),
  }
  const byKey = new Map(state.items.map((it) => [it.itemKey, it]))
  images.forEach((img) => {
    const key = String(img.checklistItemKey || '').trim()
    if (!key || !byKey.has(key)) return
    const row = byKey.get(key)
    const id = String(img.id || '').trim()
    if (id && !row.imageIds.includes(id)) row.imageIds.push(id)
  })
  state.items.forEach((it) => {
    if (it.status === 'skipped') return
    if (it.imageIds.length || String(it.note || '').trim()) it.status = 'active'
    else if (it.status === 'active') it.status = 'pending'
  })
  return state
}

function mergeChecklistPatch(checklistState, patchItems = []) {
  const byKey = new Map((checklistState.items || []).map((it) => [it.itemKey, { ...it }]))
  ;(patchItems || []).forEach((p) => {
    const key = String(p.itemKey || '').trim()
    if (!key || !byKey.has(key)) return
    const row = byKey.get(key)
    if (p.status != null) {
      const s = String(p.status)
      if (['pending', 'active', 'skipped'].includes(s)) row.status = s
    }
    if (p.outcome !== undefined) row.outcome = normalizeOutcome(p.outcome)
    if (p.note != null) row.note = String(p.note || '').trim().slice(0, 500)
    if (Array.isArray(p.imageIds)) {
      row.imageIds = p.imageIds.map(String).filter(Boolean)
    }
    if (row.status !== 'skipped' && (row.imageIds.length || row.note)) {
      row.status = 'active'
    }
  })
  return {
    catalogVersion: checklistState.catalogVersion || CATALOG_VERSION,
    categoryId: checklistState.categoryId,
    items: Array.from(byKey.values()),
  }
}

function buildMerchantChecklistView(album, images = []) {
  let state = hydrateChecklistState(album)
  state = syncChecklistImageLinks(state, images)
  const defs = resolveCategoryItems(state.categoryId)
  const defByKey = new Map(defs.items.map((d) => [d.itemKey, d]))
  const imageById = new Map((images || []).map((img) => [String(img.id), img]))

  const guidanceItems = state.items.map((it) => {
    const def = defByKey.get(it.itemKey) || {}
    const imgs = (it.imageIds || [])
      .map((id) => imageById.get(String(id)))
      .filter(Boolean)
      .map((img) => ({
        id: img.id,
        url: img.rawUrl || img.url || '',
        caption: String(img.caption || ''),
        nodeId: img.nodeId || '',
      }))
    return {
      itemKey: it.itemKey,
      label: def.label || it.itemKey,
      group: def.group || '',
      suggestStageId: def.suggestStageId || 'stage_2',
      noteExample: def.noteExample || '',
      strength: def.strength || 'tip',
      linkHint: def.linkHint || '',
      status: it.status,
      outcome: it.outcome,
      outcomeLabel: it.outcome ? OUTCOME_LABELS[it.outcome] || it.outcome : '',
      note: it.note || '',
      images: imgs,
    }
  })

  const activeCount = guidanceItems.filter((it) => it.status === 'active').length
  const strongPending = guidanceItems.filter(
    (it) => it.strength === 'strong' && it.status === 'pending',
  ).length

  return {
    catalogVersion: state.catalogVersion,
    categoryId: state.categoryId,
    categoryLabel: defs.label,
    completeness: {
      activeCount,
      totalCount: guidanceItems.length,
      strongPendingCount: strongPending,
    },
    items: guidanceItems,
    /** 持久化用（无定义字段） */
    state,
  }
}

/** 车主真实作业清单：仅有图或非空说明的项 */
function buildOwnerWorkChecklistView(album, images = []) {
  const merchant = buildMerchantChecklistView(album, images)
  const workItems = merchant.items
    .filter((it) => (it.images && it.images.length) || String(it.note || '').trim())
    .map((it) => ({
      itemKey: it.itemKey,
      label: it.label,
      group: it.group,
      outcome: it.outcome,
      outcomeLabel: it.outcomeLabel,
      note: it.note,
      images: it.images,
    }))
  return {
    categoryId: merchant.categoryId,
    categoryLabel: merchant.categoryLabel,
    items: workItems,
  }
}

function ensureChecklistOnCreate(albumLike = {}) {
  const categoryId = resolveCategoryIdFromAlbum(albumLike)
  return buildEmptyChecklistState(categoryId)
}

module.exports = {
  OUTCOME_LABELS,
  hydrateChecklistState,
  syncChecklistImageLinks,
  mergeChecklistPatch,
  buildMerchantChecklistView,
  buildOwnerWorkChecklistView,
  ensureChecklistOnCreate,
  resolveCategoryIdFromAlbum,
}
