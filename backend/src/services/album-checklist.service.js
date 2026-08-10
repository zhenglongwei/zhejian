/**
 * 相册软清单运行时：水合、挂图同步、待处理/跟进、车主阅读清单
 * 口径：docs/04_维修过程相册/18_服务类目检测清单上线方案.md
 */
const {
  CATALOG_VERSION,
  resolveCategoryIdFromAlbum,
  resolveCategoryItems,
  buildEmptyChecklistState,
} = require('../constants/service-checklist-catalog')

const OUTCOMES = new Set([
  'normal',
  'observed',
  'recommend_replace',
  'replaced',
  'not_replaced',
  'repaired_other',
])

const OUTCOME_LABELS = {
  normal: '正常',
  observed: '已检查',
  recommend_replace: '建议更换',
  replaced: '已更换',
  not_replaced: '建议更换 · 本次未更换',
  repaired_other: '需处理 / 已处理',
}

/** 自动进入施工待处理的结果（仅检查/自定义等非正常均进） */
const AUTO_WORK_OUTCOMES = new Set([
  'recommend_replace',
  'replaced',
  'not_replaced',
  'repaired_other',
  'observed',
])

const REMOVED_AS = new Set(['mismatch', 'owner_declined'])

/** 图注：除「正常」外（含自定义文字）→ 整项需后续处理 */
function captionIsNormalOnly(caption = '') {
  const t = String(caption || '').trim()
  if (!t) return true
  if (!/^正常(；|;|：|:)?/.test(t)) return false
  const rest = t.replace(/^正常(；|;|：|:)?\s*/, '')
  return !/建议更换|需处理|仅检查|已更换|未更换|已处理/.test(rest)
}

function captionsNeedWork(captions = []) {
  return (captions || []).some((c) => {
    const t = String(c || '').trim()
    if (!t) return false
    return !captionIsNormalOnly(t)
  })
}

/** 从多张图注推断项结果：异常优先于正常；仅检查也算需处理 */
function inferOutcomeFromCaptions(captions = []) {
  const list = (captions || []).map((c) => String(c || '').trim()).filter(Boolean)
  if (!list.length) return null
  if (list.some((t) => /建议更换/.test(t))) return 'recommend_replace'
  if (list.some((t) => /需处理|已处理/.test(t))) return 'repaired_other'
  if (list.some((t) => /已更换/.test(t))) return 'replaced'
  if (list.some((t) => /未更换/.test(t))) return 'not_replaced'
  if (list.some((t) => /仅检查/.test(t))) return 'observed'
  if (list.some((t) => !captionIsNormalOnly(t))) return 'repaired_other'
  if (list.every((t) => captionIsNormalOnly(t))) return 'normal'
  return null
}

function normalizeWork(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const source = src.source === 'manual_add' || src.source === 'auto' ? src.source : null
  const removedAs = REMOVED_AS.has(String(src.removedAs || '')) ? String(src.removedAs) : null
  const deferNote = String(src.deferNote || '').trim().slice(0, 200)
  return { source, removedAs, deferNote }
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
      work: normalizeWork(prev.work),
    }
  })
  return {
    catalogVersion: CATALOG_VERSION,
    categoryId: resolved.categoryId,
    items,
  }
}

function syncChecklistImageLinks(checklistState, images = []) {
  const state = {
    catalogVersion: checklistState.catalogVersion || CATALOG_VERSION,
    categoryId: checklistState.categoryId,
    items: (checklistState.items || []).map((it) => ({
      ...it,
      work: normalizeWork(it.work),
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
  const byKey = new Map(
    (checklistState.items || []).map((it) => [it.itemKey, { ...it, work: normalizeWork(it.work) }]),
  )
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
    if (p.work != null && typeof p.work === 'object') {
      const next = normalizeWork({ ...row.work, ...p.work })
      if (Object.prototype.hasOwnProperty.call(p.work, 'source')) {
        next.source =
          p.work.source === 'manual_add' || p.work.source === 'auto' || p.work.source === null
            ? p.work.source
            : row.work.source
      }
      if (Object.prototype.hasOwnProperty.call(p.work, 'removedAs')) {
        const r = p.work.removedAs
        next.removedAs = r === null || r === '' ? null : REMOVED_AS.has(String(r)) ? String(r) : row.work.removedAs
      }
      if (Object.prototype.hasOwnProperty.call(p.work, 'deferNote')) {
        next.deferNote = String(p.work.deferNote || '').trim().slice(0, 200)
      }
      row.work = next
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

function resolveWorkFlags(it, images = []) {
  const work = normalizeWork(it.work)
  if (work.removedAs === 'owner_declined') {
    return { inWorkQueue: false, inFollowUp: true, work }
  }
  if (work.removedAs === 'mismatch') {
    return { inWorkQueue: false, inFollowUp: false, work }
  }
  const captions = (images || []).map((img) => img.caption || '')
  const fromCaptions = captionsNeedWork(captions)
  const inferred = inferOutcomeFromCaptions(captions)
  const outcome = it.outcome || inferred
  const auto = AUTO_WORK_OUTCOMES.has(outcome) || fromCaptions
  const manual = work.source === 'manual_add'
  const inWorkQueue = Boolean(auto || manual)
  return { inWorkQueue, inFollowUp: false, work, inferredOutcome: inferred }
}

function mapImageViews(imageIds, imageById) {
  const stageTitle = {
    stage_1: '接车',
    stage_2: '检测',
    stage_5: '施工',
    stage_6: '完工',
  }
  return (imageIds || [])
    .map((id) => imageById.get(String(id)))
    .filter(Boolean)
    .map((img) => ({
      id: img.id,
      url: img.rawUrl || img.url || '',
      caption: String(img.caption || ''),
      nodeId: img.nodeId || '',
      nodeTitle: stageTitle[img.nodeId] || '',
    }))
}

function buildMerchantChecklistView(album, images = []) {
  let state = hydrateChecklistState(album)
  state = syncChecklistImageLinks(state, images)
  const defs = resolveCategoryItems(state.categoryId)
  const defByKey = new Map(defs.items.map((d) => [d.itemKey, d]))
  const imageById = new Map((images || []).map((img) => [String(img.id), img]))

  const guidanceItems = state.items.map((it) => {
    const def = defByKey.get(it.itemKey) || {}
    const imgs = mapImageViews(it.imageIds, imageById)
    const flags = resolveWorkFlags(it, imgs)
    const outcome = it.outcome || flags.inferredOutcome || null
    let outcomeLabel = outcome ? OUTCOME_LABELS[outcome] || outcome : ''
    if (flags.work.removedAs === 'owner_declined') {
      outcomeLabel = flags.work.deferNote
        ? `车主要求暂不处理：${flags.work.deferNote}`
        : '车主要求暂不处理'
    }
    return {
      itemKey: it.itemKey,
      label: def.label || it.itemKey,
      group: def.group || '',
      suggestStageId: def.suggestStageId || 'stage_2',
      noteExample: def.noteExample || '',
      strength: def.strength || 'tip',
      linkHint: def.linkHint || '',
      status: it.status,
      outcome,
      outcomeLabel,
      note: it.note || '',
      images: imgs,
      work: flags.work,
      inWorkQueue: flags.inWorkQueue,
      inFollowUp: flags.inFollowUp,
    }
  })

  const activeCount = guidanceItems.filter((it) => it.status === 'active').length
  const strongPending = guidanceItems.filter(
    (it) => it.strength === 'strong' && it.status === 'pending',
  ).length

  const workQueueItems = guidanceItems.filter((it) => it.inWorkQueue)
  const followUpItems = guidanceItems.filter((it) => it.inFollowUp)
  const stageItems = {
    stage_1: guidanceItems.filter((it) => it.suggestStageId === 'stage_1'),
    stage_2: guidanceItems.filter((it) => it.suggestStageId === 'stage_2'),
  }

  return {
    catalogVersion: state.catalogVersion,
    categoryId: state.categoryId,
    categoryLabel: defs.label,
    completeness: {
      activeCount,
      totalCount: guidanceItems.length,
      strongPendingCount: strongPending,
      workQueueCount: workQueueItems.length,
      followUpCount: followUpItems.length,
    },
    items: guidanceItems,
    stageItems,
    workQueueItems,
    followUpItems,
    state,
  }
}

/** 车主：有图或说明的完整检查项；同项下含各阶段图 */
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
      deferNote: it.work && it.work.removedAs === 'owner_declined' ? it.work.deferNote || '' : '',
      deferredByOwner: Boolean(it.inFollowUp),
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
  AUTO_WORK_OUTCOMES,
  hydrateChecklistState,
  syncChecklistImageLinks,
  mergeChecklistPatch,
  resolveWorkFlags,
  inferOutcomeFromCaptions,
  captionsNeedWork,
  buildMerchantChecklistView,
  buildOwnerWorkChecklistView,
  ensureChecklistOnCreate,
  resolveCategoryIdFromAlbum,
}
