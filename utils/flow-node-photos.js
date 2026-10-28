/**
 * 旧相册阶段的图并进对应节点一次。
 * 真源：docs/04_维修过程相册/26_商家端事件节点与单据节点链流程.md
 * 接车 / 检测 / 工单只认节点草稿里的图。不把散图变成检测项或施工项。
 * 接车挂图唯一真源：pendingImages；旧袋并一次后清空。
 */

const FOLD_KINDS = {
  intake: ['stage_1'],
  inspection: ['stage_2'],
  work: ['stage_5'],
  intake_inspection: ['stage_1', 'stage_2'],
}

function photoKey(url) {
  const bare = String(url || '')
    .trim()
    .split('?')[0]
    .split('#')[0]
  if (!bare) return ''
  const mark = '/uploads/'
  const at = bare.lastIndexOf(mark)
  if (at >= 0) return bare.slice(at + mark.length)
  return bare
}

function imageUrl(raw) {
  if (typeof raw === 'string') return String(raw || '').trim()
  return String((raw && (raw.url || raw.rawUrl)) || '').trim()
}

function stageIdsFor(node) {
  if (!node || !FOLD_KINDS[node.kind]) return []
  if (Array.isArray(node.legacyStageIds) && node.legacyStageIds.length) return node.legacyStageIds
  if (node.legacyStageId) return [node.legacyStageId]
  return FOLD_KINDS[node.kind]
}

function ownedKeys(node) {
  const draft = (node && node.photoDraft) || {}
  const keys = {}
  const mark = (raw) => {
    const key = photoKey(imageUrl(raw))
    if (key) keys[key] = true
  }
  mark(draft.odometerUrl)
  mark(draft.deliveryExteriorUrl)
  ;(Array.isArray(draft.selectedDeliveryUrls) ? draft.selectedDeliveryUrls : []).forEach(mark)
  ;(Array.isArray(draft.pendingImages) ? draft.pendingImages : []).forEach(mark)
  ;(Array.isArray(draft.findings) ? draft.findings : []).forEach((item) => {
    const shots =
      item && Array.isArray(item.images) && item.images.length
        ? item.images
        : item && item.url
          ? [item]
          : []
    shots.forEach(mark)
  })
  ;(Array.isArray(draft.intakeResults) ? draft.intakeResults : []).forEach((item) => {
    ;(item && Array.isArray(item.images) ? item.images : []).forEach(mark)
  })
  return keys
}

function stageImages(node, albumNodes) {
  const out = []
  stageIdsFor(node).forEach((stageId) => {
    const stage = (albumNodes || []).find((item) => item && item.id === stageId)
    ;(stage && Array.isArray(stage.images) ? stage.images : []).forEach((img) => {
      const url = imageUrl(img)
      if (!url) return
      out.push({
        url,
        imageId: String((img && (img.imageId || img.id)) || ''),
        caption: String((img && img.caption) || ''),
      })
    })
  })
  return out
}

/**
 * 把旧阶段里、节点上还没有的图补进 pendingImages。
 * 没有要补的返回 null。不改 findings。
 */
function planLegacyPhotoFold(flowNodes, albumNodes) {
  const list = Array.isArray(flowNodes) ? flowNodes : []
  let changed = false
  const next = list.map((node) => {
    if (!node || !FOLD_KINDS[node.kind]) return node
    const owned = ownedKeys(node)
    const extra = []
    stageImages(node, albumNodes).forEach((img) => {
      const key = photoKey(img.url)
      if (!key || owned[key]) return
      owned[key] = true
      extra.push(img)
    })
    if (!extra.length) return node
    changed = true
    const draft = (node.photoDraft && typeof node.photoDraft === 'object' && node.photoDraft) || {}
    const pending = Array.isArray(draft.pendingImages) ? draft.pendingImages.slice() : []
    return {
      ...node,
      photoDraft: {
        ...draft,
        pendingImages: pending.concat(extra),
      },
    }
  })
  return changed ? next : null
}

function asPendingImage(raw, caption = '') {
  const url = imageUrl(raw)
  if (!url) return null
  const imageId = String(
    (typeof raw === 'object' && raw && (raw.imageId || raw.id)) || '',
  ).trim()
  const cap = String(
    (typeof raw === 'object' && raw && raw.caption) || caption || '',
  ).trim()
  return imageId || cap ? { url, imageId, caption: cap } : { url, imageId }
}

/**
 * 接车旧袋 → pendingImages 一次，并清空旧袋挂图。
 * 纯 intake 才收 findings；intake_inspection 的检测 findings 不动。
 * 没有要改的返回 null。
 */
function planIntakePhotoDraftFold(flowNodes) {
  const list = Array.isArray(flowNodes) ? flowNodes : []
  let changed = false
  const next = list.map((node) => {
    if (!node || (node.kind !== 'intake' && node.kind !== 'intake_inspection')) return node
    const draft = (node.photoDraft && typeof node.photoDraft === 'object' && node.photoDraft) || {}
    const owned = {}
    const pending = []
    const pushPending = (raw, caption) => {
      const img = asPendingImage(raw, caption)
      if (!img) return
      const key = photoKey(img.url)
      if (!key || owned[key]) return
      owned[key] = true
      pending.push(img)
    }
    ;(Array.isArray(draft.pendingImages) ? draft.pendingImages : []).forEach((img) =>
      pushPending(img),
    )
    let bagTouched = false
    const odo = String(draft.odometerUrl || '').trim()
    if (odo) {
      pushPending(
        { url: odo, imageId: draft.odometerImageId || '' },
        '仪表里程',
      )
      bagTouched = true
    }
    const rawResults = Array.isArray(draft.intakeResults) ? draft.intakeResults : []
    let intakeResultsChanged = false
    const intakeResults = []
    rawResults.forEach((row) => {
      if (!row || typeof row !== 'object') return
      const shots = Array.isArray(row.images) ? row.images : []
      if (shots.length) {
        intakeResultsChanged = true
        bagTouched = true
        shots.forEach((img) => pushPending(img, row.partName || row.category || ''))
      }
      if (row.url) {
        intakeResultsChanged = true
        bagTouched = true
        pushPending(row, row.partName || row.category || '')
      }
      const reading = String(row.reading || '').trim()
      const category = String(row.category || '').trim()
      const partName = String(row.partName || '').trim()
      if (!reading && !category && !partName) {
        if (shots.length || row.url) intakeResultsChanged = true
        return
      }
      if (shots.length || row.url || row.imageId) intakeResultsChanged = true
      intakeResults.push({
        ...(category ? { category } : {}),
        ...(partName ? { partName } : {}),
        ...(reading ? { reading } : {}),
      })
    })

    let findings = Array.isArray(draft.findings) ? draft.findings : null
    let findingsCleared = false
    if (node.kind === 'intake' && findings && findings.length) {
      bagTouched = true
      findingsCleared = true
      findings.forEach((row) => {
        const shots =
          row && Array.isArray(row.images) && row.images.length
            ? row.images
            : row && row.url
              ? [row]
              : []
        shots.forEach((img) => pushPending(img, row && row.partName))
      })
      findings = []
    }

    const hadOdo = Boolean(odo)
    if (!bagTouched && !intakeResultsChanged && !findingsCleared && !hadOdo) return node
    // 旧袋已空且 pending 未变：无需落库
    if (
      !hadOdo &&
      !intakeResultsChanged &&
      !findingsCleared &&
      pending.length === (Array.isArray(draft.pendingImages) ? draft.pendingImages.length : 0)
    ) {
      return node
    }
    changed = true
    const photoDraft = {
      ...draft,
      pendingImages: pending,
      odometerUrl: '',
      odometerImageId: '',
      intakeResults,
    }
    if (findingsCleared) photoDraft.findings = findings
    return { ...node, photoDraft }
  })
  return changed ? next : null
}

/** 旧阶段并入 + 接车旧袋并入，任一有改动则返回新列表 */
function planAllPhotoFolds(flowNodes, albumNodes) {
  let nodes = Array.isArray(flowNodes) ? flowNodes : []
  let changed = false
  const stage = planLegacyPhotoFold(nodes, albumNodes)
  if (stage) {
    nodes = stage
    changed = true
  }
  const intake = planIntakePhotoDraftFold(nodes)
  if (intake) {
    nodes = intake
    changed = true
  }
  return changed ? nodes : null
}

module.exports = {
  planLegacyPhotoFold,
  planIntakePhotoDraftFold,
  planAllPhotoFolds,
  photoKey,
}
