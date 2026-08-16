/**
 * 相册软清单运行时：水合、挂图同步、施工清单/跟进、车主阅读清单
 * 口径：docs/04_维修过程相册/18_服务类目检测清单上线方案.md
 */
const {
  CATALOG_VERSION,
  resolveCategoryIdFromAlbum,
  resolveCategoryItems,
  buildEmptyChecklistState,
  getRawCategory,
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

function normalizeOutcome(raw) {
  if (raw == null || raw === '') return null
  const value = String(raw).trim()
  return OUTCOMES.has(value) ? value : null
}

/**
 * 自动进入施工清单的结果
 * 「仅检查」observed 默认不进（见 18 §3.2）；须建议更换/需处理等
 */
const AUTO_WORK_OUTCOMES = new Set([
  'recommend_replace',
  'replaced',
  'not_replaced',
  'repaired_other',
])

/** 写入码；读侧兼容旧 mismatch / owner_declined */
const REMOVED_AS_CANONICAL = new Set(['skipped', 'follow_up'])
const REMOVED_AS_LEGACY = {
  mismatch: 'skipped',
  owner_declined: 'follow_up',
}

function canonicalizeRemovedAs(raw) {
  if (raw == null || raw === '') return null
  const value = String(raw).trim()
  if (REMOVED_AS_CANONICAL.has(value)) return value
  if (REMOVED_AS_LEGACY[value]) return REMOVED_AS_LEGACY[value]
  return null
}

function isFollowUpRemoved(removedAs) {
  return canonicalizeRemovedAs(removedAs) === 'follow_up'
}

function isSkippedRemoved(removedAs) {
  return canonicalizeRemovedAs(removedAs) === 'skipped'
}

function isRemovedFromWork(removedAs) {
  return Boolean(canonicalizeRemovedAs(removedAs))
}

/** 图注：纯「正常」或空 */
function captionIsNormalOnly(caption = '') {
  const t = String(caption || '').trim()
  if (!t) return true
  if (!/^正常(；|;|：|:)?/.test(t)) return false
  const rest = t.replace(/^正常(；|;|：|:)?\s*/, '')
  return !/建议更换|需处理|仅检查|已更换|未更换|已处理/.test(rest)
}

/** 图注是否触发施工延伸（正常/仅检查单独出现 → 否） */
function captionNeedsConstruction(caption = '') {
  const t = String(caption || '').trim()
  if (!t) return false
  if (captionIsNormalOnly(t)) return false
  if (/^仅检查(；|;|：|:)?/.test(t)) {
    const rest = t.replace(/^仅检查(；|;|：|:)?\s*/, '')
    return /建议更换|需处理|已更换|未更换|已处理/.test(rest)
  }
  return true
}

function captionsNeedWork(captions = []) {
  return (captions || []).some((c) => captionNeedsConstruction(c))
}

function itemHasEvidence(it) {
  const imgs = it.images || []
  return imgs.length > 0 || Boolean(String(it.note || '').trim())
}

/** 检测父项是否足以解锁施工衍生项：有留证 + 需处理/需更换 */
function parentCanUnlockFollowUps(it) {
  if (!it || it.workOnly) return false
  if (!(it.workFollowUpKeys || []).length) return false
  if (it.work && it.work.removedAs) return false
  if (!itemHasEvidence(it)) return false
  if (it.outcome === 'normal') return false
  return Boolean(it.inWorkQueue)
}

/**
 * 施工待处理列表：只展示「施工延伸」
 * - 有衍生项的检测父项（如旧机油）不出现在施工
 * - 衍生项 / 无衍生的异常检测项（如火花塞）可出现
 */
function isConstructionQueueItem(it) {
  if (!it || !it.inWorkQueue) return false
  if (!it.workOnly && (it.workFollowUpKeys || []).length > 0) return false
  return true
}

/** catalog group=接车建档（里程表、到店诉求等） */
function isIntakeArchiveItem(it = {}) {
  const group = String(it.group || it.groupName || '').trim()
  return group === '接车建档'
}

/** 图注是否含明确异常标签（建档项进队仅认这些，不认自由说明） */
function captionsHaveExplicitAbnormal(captions = []) {
  return (captions || []).some((c) =>
    /建议更换|需处理|已处理|已更换|未更换/.test(String(c || '')),
  )
}

/**
 * 从多张图注推断项结果：异常优先于正常。
 * 建档项：自由说明不得推断为需处理（见 18 §3.2）。
 */
function inferOutcomeFromCaptions(captions = [], options = {}) {
  const archiveItem = Boolean(options.archiveItem)
  const list = (captions || []).map((c) => String(c || '').trim()).filter(Boolean)
  if (!list.length) return null
  if (list.some((t) => /建议更换/.test(t))) return 'recommend_replace'
  if (list.some((t) => /需处理|已处理/.test(t))) return 'repaired_other'
  if (list.some((t) => /已更换/.test(t))) return 'replaced'
  if (list.some((t) => /未更换/.test(t))) return 'not_replaced'
  if (list.some((t) => /^仅检查/.test(t))) return 'observed'
  if (list.every((t) => captionIsNormalOnly(t))) return 'normal'
  if (archiveItem) return null
  if (list.some((t) => !captionIsNormalOnly(t))) return 'repaired_other'
  return null
}

function normalizeWork(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const source = src.source === 'manual_add' || src.source === 'auto' ? src.source : null
  const removedAs = canonicalizeRemovedAs(src.removedAs)
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
  const fromAlbum = resolveCategoryIdFromAlbum({
    templateId: album.templateId,
    serviceName: album.serviceName,
  })
  // 已落库的 categoryId 优先（避免仅靠服务名误落到 default）
  const existingCat = existing && existing.categoryId ? String(existing.categoryId).trim() : ''
  const categoryId = existingCat && getRawCategory(existingCat) ? existingCat : fromAlbum
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
        next.removedAs =
          r === null || r === '' ? null : canonicalizeRemovedAs(r) || row.work.removedAs
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
  if (isFollowUpRemoved(work.removedAs)) {
    return { inWorkQueue: false, inFollowUp: true, work }
  }
  if (isSkippedRemoved(work.removedAs)) {
    return { inWorkQueue: false, inFollowUp: false, work }
  }
  const archiveItem = isIntakeArchiveItem(it)
  const captions = (images || []).map((img) => img.caption || '')
  const hasCaptionText = captions.some((c) => String(c || '').trim())
  const fromCaptions = archiveItem
    ? captionsHaveExplicitAbnormal(captions)
    : captionsNeedWork(captions)
  const inferred = inferOutcomeFromCaptions(captions, { archiveItem })
  // 施工随检测：图注能推断时覆盖落库旧 outcome
  const outcome = inferred != null ? inferred : normalizeOutcome(it.outcome)
  const evidenced = itemHasEvidence({ ...it, images })
  // 无留证不得因残留 outcome 进施工；手增除外
  let auto = false
  if (evidenced) {
    if (archiveItem) {
      // 建档：有图注时只认图注推断的明确异常；无图注时可认落库异常 outcome
      auto =
        (inferred != null && AUTO_WORK_OUTCOMES.has(inferred)) ||
        (!hasCaptionText && AUTO_WORK_OUTCOMES.has(outcome)) ||
        fromCaptions
    } else {
      auto = AUTO_WORK_OUTCOMES.has(outcome) || fromCaptions
    }
  }
  const manual = work.source === 'manual_add'
  const inWorkQueue = Boolean(auto || manual)
  return { inWorkQueue, inFollowUp: false, work, inferredOutcome: inferred, outcome }
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

  const baseItems = state.items.map((it) => {
    const def = defByKey.get(it.itemKey) || {}
    const imgs = mapImageViews(it.imageIds, imageById)
    const flags = resolveWorkFlags(it, imgs)
    const outcome =
      flags.outcome != null
        ? flags.outcome
        : flags.inferredOutcome != null
          ? flags.inferredOutcome
          : it.outcome || null
    let outcomeLabel = outcome ? OUTCOME_LABELS[outcome] || outcome : ''
    if (isFollowUpRemoved(flags.work.removedAs)) {
      outcomeLabel = flags.work.deferNote
        ? `择日再约：${flags.work.deferNote}`
        : '择日再约'
    }
    return {
      itemKey: it.itemKey,
      label: def.label || it.itemKey,
      group: def.group || '',
      suggestStageId: def.suggestStageId || 'stage_2',
      workOnly: Boolean(def.workOnly || def.suggestStageId === 'stage_5'),
      workFollowUpKeys: Array.isArray(def.workFollowUpKeys) ? def.workFollowUpKeys : [],
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
      unlockedByParent: false,
    }
  })

  // 父项「有留证且需处理/更换」→ 解锁施工衍生项（无检测则无施工）
  const unlockedKeys = new Set()
  baseItems.forEach((it) => {
    if (!parentCanUnlockFollowUps(it)) return
    ;(it.workFollowUpKeys || []).forEach((k) => unlockedKeys.add(String(k)))
  })

  const guidanceItems = baseItems.map((it) => {
    if (!it.workOnly) return it
    const unlocked = unlockedKeys.has(it.itemKey)
    const manual = it.work && it.work.source === 'manual_add'
    if (isFollowUpRemoved(it.work.removedAs)) {
      return { ...it, inWorkQueue: false, inFollowUp: true, unlockedByParent: unlocked }
    }
    if (isSkippedRemoved(it.work.removedAs)) {
      return { ...it, inWorkQueue: false, inFollowUp: false, unlockedByParent: false }
    }
    // 衍生项：只靠父项解锁或手增；禁止「无父项仅因自己有图」冒进施工列表
    const inWorkQueue = Boolean(unlocked || manual)
    return {
      ...it,
      inWorkQueue,
      inFollowUp: false,
      unlockedByParent: unlocked,
      work: unlocked && !it.work.source ? { ...it.work, source: 'auto' } : it.work,
    }
  })

  const activeCount = guidanceItems.filter((it) => it.status === 'active').length
  const strongPending = guidanceItems.filter(
    (it) => it.strength === 'strong' && it.status === 'pending' && !it.workOnly,
  ).length

  const workQueueItems = sortWorkQueueByFamily(
    guidanceItems.filter((it) => isConstructionQueueItem(it)),
    guidanceItems,
  )
  const followUpItems = guidanceItems.filter((it) => it.inFollowUp)
  // 节点清单：不含施工衍生项（workOnly / stage_5）
  const stageListable = (it, stageId) =>
    !it.workOnly && it.suggestStageId === stageId
  const stageItems = {
    stage_1: guidanceItems.filter((it) => stageListable(it, 'stage_1')),
    stage_2: guidanceItems.filter((it) => stageListable(it, 'stage_2')),
    stage_5: [],
    stage_6: guidanceItems.filter((it) => stageListable(it, 'stage_6')),
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

const OWNER_STAGE_ORDER = ['stage_1', 'stage_2', 'stage_5', 'stage_6']
const OWNER_STAGE_TITLE = {
  stage_1: '接车',
  stage_2: '检测',
  stage_5: '施工',
  stage_6: '完工',
}

/** 展示侧视为「无说明」的纯结果标签（兼容旧图注「正常;」） */
const REDUNDANT_OUTCOME_CAPTIONS = new Set([
  '正常',
  '已检查',
  '仅检查',
  '建议更换',
  '已更换',
  '未更换',
  '需处理',
  '已处理',
  '需处理 / 已处理',
  '建议更换 · 本次未更换',
  '择日再约',
])

function scrubOwnerCaption(caption = '') {
  const raw = String(caption || '').trim()
  if (!raw) return ''
  const normalized = raw.replace(/[；;。.\s]+$/g, '').trim()
  if (!normalized) return ''
  if (REDUNDANT_OUTCOME_CAPTIONS.has(normalized)) return ''
  // 「正常；」或「建议更换：xxx」整句等于标签时已覆盖；标签后仅空白也清空
  const m = normalized.match(/^(正常|已检查|仅检查|建议更换|已更换|未更换|需处理|已处理)([；;：:].*)?$/)
  if (m) {
    const rest = String(m[2] || '')
      .replace(/^[；;：:\s]+/, '')
      .trim()
    if (!rest) return ''
  }
  return raw
}

function groupOwnerImagesByStage(images = []) {
  const buckets = new Map()
  ;(images || []).forEach((img) => {
    if (!img || !img.url) return
    const stageId = String(img.nodeId || '').trim() || 'other'
    if (!buckets.has(stageId)) {
      buckets.set(stageId, {
        stageId,
        stageTitle: String(img.nodeTitle || '').trim() || OWNER_STAGE_TITLE[stageId] || '过程',
        images: [],
      })
    }
    buckets.get(stageId).images.push({
      url: img.url,
      caption: scrubOwnerCaption(img.caption),
    })
  })
  const ordered = []
  OWNER_STAGE_ORDER.forEach((id) => {
    if (buckets.has(id)) ordered.push(buckets.get(id))
  })
  buckets.forEach((group, id) => {
    if (!OWNER_STAGE_ORDER.includes(id)) ordered.push(group)
  })
  return ordered
}

function mapOwnerWorkItem(it) {
  const followUp = isFollowUpRemoved(it.work && it.work.removedAs)
  let outcomeLabel = it.outcomeLabel || ''
  if (isSkippedRemoved(it.work && it.work.removedAs)) {
    const outcome = it.outcome
    outcomeLabel = outcome ? OUTCOME_LABELS[outcome] || outcome : ''
  }
  return {
    itemKey: it.itemKey,
    label: it.label,
    group: it.group,
    outcome: it.outcome,
    outcomeLabel,
    note: scrubOwnerCaption(it.note),
    images: it.images,
    workFollowUpKeys: Array.isArray(it.workFollowUpKeys) ? it.workFollowUpKeys : [],
    workOnly: Boolean(it.workOnly),
    deferNote: followUp ? (it.work && it.work.deferNote) || '' : '',
    deferredByOwner: followUp,
    followUpLabel: followUp
      ? it.work && it.work.deferNote
        ? `择日再约：${it.work.deferNote}`
        : '择日再约'
      : '',
  }
}

function ownerItemHasRealEvidence(mapped) {
  if (!mapped) return false
  const hasImg = (mapped.images || []).some((img) => img && img.url)
  const note = scrubOwnerCaption(mapped.note)
  return Boolean(hasImg || note)
}

/**
 * 服务项目连通：检查父项↔施工衍生项；共用同一批施工项的多个检查项并入同一族
 * @returns {{ rootKey: string, members: object[] }[]}
 */
function buildOwnerProjectClusters(merchantItems = []) {
  const items = merchantItems || []
  const parent = new Map()
  const ensure = (k) => {
    if (!parent.has(k)) parent.set(k, k)
  }
  const find = (k) => {
    ensure(k)
    if (parent.get(k) !== k) parent.set(k, find(parent.get(k)))
    return parent.get(k)
  }
  const union = (a, b) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }

  const childToParents = new Map()
  items.forEach((it) => {
    const key = String((it && it.itemKey) || '').trim()
    if (!key) return
    ensure(key)
    const kids = Array.isArray(it.workFollowUpKeys) ? it.workFollowUpKeys.map(String) : []
    kids.forEach((k) => {
      const child = String(k || '').trim()
      if (!child) return
      ensure(child)
      union(key, child)
      if (!childToParents.has(child)) childToParents.set(child, [])
      childToParents.get(child).push(key)
    })
  })
  childToParents.forEach((parents) => {
    for (let i = 0; i < parents.length; i += 1) {
      for (let j = i + 1; j < parents.length; j += 1) {
        union(parents[i], parents[j])
      }
    }
  })

  const rootOrder = []
  const rootSeen = new Set()
  const membersByRoot = new Map()
  items.forEach((it) => {
    const key = String((it && it.itemKey) || '').trim()
    if (!key) return
    const root = find(key)
    if (!rootSeen.has(root)) {
      rootSeen.add(root)
      rootOrder.push(root)
    }
    if (!membersByRoot.has(root)) membersByRoot.set(root, [])
    membersByRoot.get(root).push(it)
  })

  return rootOrder.map((rootKey) => ({
    rootKey,
    members: membersByRoot.get(rootKey) || [],
  }))
}

/** 卡标题：检查父项名；多项顿号并列；仅施工衍生时用项名 */
function resolveOwnerProjectCardTitle(members = []) {
  const list = members || []
  const parents = list.filter((m) => !m.workOnly)
  if (parents.length === 1) return String(parents[0].label || parents[0].itemKey || '').trim()
  if (parents.length > 1) {
    return parents
      .map((m) => String(m.label || m.itemKey || '').trim())
      .filter(Boolean)
      .join('、')
  }
  const seed = list[0] || {}
  return String(seed.label || seed.group || seed.itemKey || '').trim() || '本次处理'
}

function resolveOwnerCardGroupLabel(members = []) {
  const seed = (members || []).find((m) => !m.workOnly) || (members || [])[0] || {}
  return String(seed.group || '').trim()
}

const OWNER_OUTCOME_PRIORITY = [
  'replaced',
  'repaired_other',
  'recommend_replace',
  'not_replaced',
  'observed',
  'normal',
]

function pickOwnerCardOutcome(members = []) {
  const list = members || []
  const deferred = list.find((m) => m.deferredByOwner)
  if (deferred) {
    return {
      outcome: deferred.outcome || null,
      outcomeLabel: deferred.followUpLabel || '择日再约',
      followUpLabel: deferred.followUpLabel || '择日再约',
      deferNote: deferred.deferNote || '',
      deferredByOwner: true,
    }
  }
  let best = null
  for (let i = 0; i < OWNER_OUTCOME_PRIORITY.length; i += 1) {
    const code = OWNER_OUTCOME_PRIORITY[i]
    const hit = list.find((m) => m.outcome === code)
    if (hit) {
      best = hit
      break
    }
  }
  if (!best) best = list.find((m) => m.outcomeLabel) || list[0] || {}
  return {
    outcome: best.outcome || null,
    outcomeLabel: best.outcomeLabel || '',
    followUpLabel: '',
    deferNote: '',
    deferredByOwner: false,
  }
}

function mergeOwnerCardNotes(members = []) {
  const notes = []
  const seen = new Set()
  ;(members || []).forEach((m) => {
    const note = scrubOwnerCaption(m.note)
    if (!note || seen.has(note)) return
    seen.add(note)
    notes.push(note)
  })
  return notes.join('\n')
}

function mergeOwnerCardStageGroups(members = []) {
  const all = []
  ;(members || []).forEach((m) => {
    ;(m.images || []).forEach((img) => {
      if (img && img.url) all.push(img)
    })
  })
  return groupOwnerImagesByStage(all)
}

/**
 * 施工清单：同一父项解锁的衍生项成组连续（按 workFollowUpKeys 顺序）
 */
function sortWorkQueueByFamily(queueItems = [], catalogOrderedItems = []) {
  const byKey = new Map((queueItems || []).map((it) => [it.itemKey, it]))
  const emitted = new Set()
  const out = []
  const emit = (key) => {
    const k = String(key || '').trim()
    if (!k || emitted.has(k) || !byKey.has(k)) return
    out.push(byKey.get(k))
    emitted.add(k)
  }
  ;(catalogOrderedItems || []).forEach((it) => {
    const kids = Array.isArray(it.workFollowUpKeys) ? it.workFollowUpKeys : []
    if (kids.length) {
      kids.forEach((k) => emit(k))
      emit(it.itemKey)
      return
    }
    emit(it.itemKey)
  })
  ;(queueItems || []).forEach((it) => emit(it.itemKey))
  return out
}

/** 车主：有图或真人话说明的检查项；父项+衍生合成主题卡；类目作分段 */
function buildOwnerWorkChecklistView(album, images = []) {
  const merchant = buildMerchantChecklistView(album, images)
  const workItems = merchant.items
    .map(mapOwnerWorkItem)
    .filter(ownerItemHasRealEvidence)
  const evidencedByKey = new Map(workItems.map((it) => [it.itemKey, it]))
  const cards = []

  buildOwnerProjectClusters(merchant.items || []).forEach(({ rootKey, members }) => {
    const evidencedMembers = members
      .map((m) => evidencedByKey.get(m.itemKey))
      .filter(Boolean)
    if (!evidencedMembers.length) return

    const stageGroups = mergeOwnerCardStageGroups(evidencedMembers)
    const note = mergeOwnerCardNotes(evidencedMembers)
    const outcomeInfo = pickOwnerCardOutcome(evidencedMembers)
    const hasImg = stageGroups.some((g) => (g.images || []).length)
    if (!hasImg && !note && !outcomeInfo.outcomeLabel && !outcomeInfo.followUpLabel) return

    const groupLabel = resolveOwnerCardGroupLabel(evidencedMembers)
    const title = resolveOwnerProjectCardTitle(evidencedMembers)
    cards.push({
      cardKey: rootKey,
      groupLabel,
      title,
      outcome: outcomeInfo.outcome,
      outcomeLabel: outcomeInfo.outcomeLabel,
      followUpLabel: outcomeInfo.followUpLabel,
      deferNote: outcomeInfo.deferNote,
      deferredByOwner: outcomeInfo.deferredByOwner,
      note,
      stageGroups,
      showStageTitles: stageGroups.length > 1,
      // 兼容旧组件：单 section 扁平化
      sections: [
        {
          itemKey: rootKey,
          label: title,
          outcome: outcomeInfo.outcome,
          outcomeLabel: outcomeInfo.outcomeLabel,
          note,
          deferNote: outcomeInfo.deferNote,
          deferredByOwner: outcomeInfo.deferredByOwner,
          followUpLabel: outcomeInfo.followUpLabel,
          stageGroups,
        },
      ],
    })
  })

  return {
    categoryId: merchant.categoryId,
    categoryLabel: merchant.categoryLabel,
    cards,
    items: workItems,
  }
}

/**
 * 案例正文用检查项过滤（18 §7.3）
 * - 已施工/有施工留证：纳入
 * - skipped：不纳入
 * - follow_up：不逐条纳入；由 buildCaseFollowUpSummary 给一句总述
 */
function filterChecklistItemsForCase(items = []) {
  return (items || []).filter((it) => {
    if (!it) return false
    if (isFollowUpRemoved(it.work && it.work.removedAs)) return false
    if (isSkippedRemoved(it.work && it.work.removedAs)) return false
    const imgs = it.images || []
    const hasConstructionPhoto = imgs.some(
      (img) => String((img && img.nodeId) || '') === 'stage_5' || String((img && img.nodeTitle) || '') === '施工',
    )
    const captions = imgs.map((img) => String((img && img.caption) || '')).join(' ')
    const doneByCaption = /已更换|已处理/.test(captions)
    const doneByOutcome = it.outcome === 'replaced' || it.outcome === 'repaired_other'
    return Boolean(hasConstructionPhoto || doneByCaption || doneByOutcome)
  })
}

function buildCaseFollowUpSummary(items = []) {
  const hasFollowUp = (items || []).some((it) => isFollowUpRemoved(it.work && it.work.removedAs))
  return hasFollowUp ? '另有建议项已与车主约定择日处理。' : ''
}

function ensureChecklistOnCreate(albumLike = {}) {
  const categoryId = resolveCategoryIdFromAlbum(albumLike)
  return buildEmptyChecklistState(categoryId)
}

module.exports = {
  OUTCOME_LABELS,
  AUTO_WORK_OUTCOMES,
  canonicalizeRemovedAs,
  isFollowUpRemoved,
  isSkippedRemoved,
  isRemovedFromWork,
  isIntakeArchiveItem,
  hydrateChecklistState,
  syncChecklistImageLinks,
  mergeChecklistPatch,
  resolveWorkFlags,
  inferOutcomeFromCaptions,
  captionsNeedWork,
  captionNeedsConstruction,
  parentCanUnlockFollowUps,
  isConstructionQueueItem,
  buildMerchantChecklistView,
  buildOwnerWorkChecklistView,
  buildOwnerProjectClusters,
  groupOwnerImagesByStage,
  scrubOwnerCaption,
  sortWorkQueueByFamily,
  filterChecklistItemsForCase,
  buildCaseFollowUpSummary,
  ensureChecklistOnCreate,
  resolveCategoryIdFromAlbum,
}
