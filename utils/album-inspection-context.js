/**
 * 相册 AI 检查 · 结构化上下文（六节点时间线 + 单据/配件/旧件）
 */
const { SERVICE_ALBUM_STAGES, getStageMeta } = require('../constants/service-album-stages')
const { buildAlbumInspectionView, buildDocumentItems } = require('./album-inspection-view')
const { collectOldPartTraces } = require('./album-inspection-matrix')
const { buildMethodGuideSections, collectGuideIssues } = require('./album-inspection-method-guide')
const {
  filterEvidenceByStage,
  resolveProcessImagesForStage,
  isOldPartEvidenceItem,
  normalizeImageList,
} = require('./album-evidence-items')
const { normalizePlanParts, normalizeAlbumParts, buildPartVerifyPairs } = require('./album-part-pairs')

function trimNote(note) {
  return String(note || '').trim().slice(0, 400)
}

function buildStageTimeline(detail = {}) {
  const evidenceItems = detail.evidenceItems || []
  const parts = detail.parts || []
  const planParts = normalizePlanParts(detail.planParts || [])
  const albumParts = normalizeAlbumParts(parts)
  const nodeById = {}
  ;(detail.nodes || []).forEach((node) => {
    const id = node && (node.id || node.nodeId)
    if (id) nodeById[id] = node
  })

  return SERVICE_ALBUM_STAGES.map((stage) => {
    const node = nodeById[stage.id] || { id: stage.id, title: stage.title, images: [], note: '' }
    const title = node.title || stage.title
    const note = trimNote(node.note)

    const documents = filterEvidenceByStage(evidenceItems, stage.id).map((item) => ({
      label: item.label || item.id,
      imageCount: normalizeImageList(item.images).length,
    }))

    const processImages = resolveProcessImagesForStage(node, evidenceItems)
    const oldPartImages =
      stage.id === 'stage_5'
        ? (evidenceItems || [])
            .filter(isOldPartEvidenceItem)
            .flatMap((item) => normalizeImageList(item.images))
        : []

    const stageParts =
      stage.id === 'stage_4'
        ? albumParts.map((p) => ({
            name: p.name,
            partType: p.partType || '',
            hasPhoto: Boolean(p.thumbUrl),
          }))
        : []

    const mediaCount =
      processImages.length +
      documents.reduce((sum, d) => sum + d.imageCount, 0) +
      oldPartImages.length +
      stageParts.filter((p) => p.hasPhoto).length

    return {
      stageId: stage.id,
      stageTitle: title,
      note,
      hasNote: Boolean(note),
      processImageCount: processImages.length,
      documents,
      oldPartImageCount: oldPartImages.length,
      parts: stageParts,
      mediaCount,
      filled: mediaCount > 0 || Boolean(note),
    }
  })
}

function resolveFocusStageMeta(focusStageId) {
  const id = String(focusStageId || '').trim()
  if (!id) return null
  const meta = getStageMeta(id)
  const timeline = buildStageTimeline({ nodes: [{ id, title: meta && meta.title }] })
  return {
    stageId: id,
    stageTitle: (meta && meta.title) || id,
  }
}

function buildInspectionTimelineContext(detail = {}, options = {}) {
  const view = buildAlbumInspectionView(detail)
  const timeline = buildStageTimeline(detail)
  const documentItems = buildDocumentItems(detail)
  const methodSections = buildMethodGuideSections(detail, documentItems, {
    showPartVerify: Boolean((detail.parts || []).length),
  })
  const guideIssues = collectGuideIssues(methodSections)
  const { pairs, extras } = buildPartVerifyPairs(
    normalizePlanParts(detail.planParts || []),
    normalizeAlbumParts(detail.parts || []),
  )
  const oldPart = collectOldPartTraces(detail)

  const focusStageId = String(options.focusStageId || '').trim()
  const focusStage = focusStageId ? timeline.find((s) => s.stageId === focusStageId) : null

  return {
    serviceName: detail.serviceName || '',
    storeName: (detail.store && detail.store.name) || detail.storeName || '',
    vehicleDisplay: detail.vehicleDisplay || '',
    templateId: detail.templateId || '',
    templateName: detail.templateName || '',
    status: detail.status || '',
    triggerContext: options.triggerContext || 'inspect_page',
    focusStageId: focusStageId || '',
    focusStageTitle: focusStage ? focusStage.stageTitle : '',
    completenessSummary: view.completeness?.summary || {},
    timeline,
    partsSummary: albumPartsSummary(detail.parts),
    partPairStats: {
      matched: pairs.filter((p) => p.linkStatus === 'linked').length,
      planOnly: pairs.filter((p) => p.linkStatus === 'plan_only').length,
      extra: extras.length,
    },
    oldPartTraces: {
      totalImages: oldPart.allImages.length,
      linkedCount: oldPart.traces.filter((t) => t.planPartId).length,
      unlinkedCount: oldPart.traces.filter((t) => !t.planPartId).length,
    },
    guideIssues: guideIssues.slice(0, 12),
    storeNote: trimNote(detail.storeNote),
  }
}

function albumPartsSummary(parts) {
  return normalizeAlbumParts(parts || []).map((p) => ({
    name: p.name,
    partType: p.partType || '',
    hasPhoto: Boolean(p.thumbUrl),
    planPartId: p.planPartId || '',
  }))
}

function collectVisionImageCandidates(detail = {}, options = {}) {
  const focusStageId = String(options.focusStageId || '').trim()
  const maxTotal = Math.max(1, Math.min(Number(options.maxImages) || 8, 12))
  const evidenceItems = detail.evidenceItems || []
  const parts = detail.parts || []
  const nodeById = {}
  ;(detail.nodes || []).forEach((node) => {
    const id = node && (node.id || node.nodeId)
    if (id) nodeById[id] = node
  })

  const candidates = []

  SERVICE_ALBUM_STAGES.forEach((stage) => {
    const node = nodeById[stage.id] || { images: [], note: '' }
    const stageTitle = (node.title || stage.title)

    filterEvidenceByStage(evidenceItems, stage.id).forEach((item) => {
      normalizeImageList(item.images).slice(0, 2).forEach((url, idx) => {
        candidates.push({
          stageId: stage.id,
          stageTitle,
          label: item.label || '单据',
          note: trimNote(node.note),
          url,
          kind: 'document',
          priority: stage.id === focusStageId ? 0 : 1,
          order: idx,
        })
      })
    })

    if (stage.id === 'stage_5') {
      ;(evidenceItems || []).filter(isOldPartEvidenceItem).forEach((item) => {
        normalizeImageList(item.images).slice(0, 1).forEach((url) => {
          candidates.push({
            stageId: stage.id,
            stageTitle,
            label: '旧件照片',
            note: trimNote(node.note),
            url,
            kind: 'old_part',
            priority: stage.id === focusStageId ? 0 : 1,
            order: 0,
          })
        })
      })
    }

    if (stage.id === 'stage_4') {
      normalizeAlbumParts(parts).forEach((part) => {
        const url = part.thumbUrl
        if (!url) return
        candidates.push({
          stageId: stage.id,
          stageTitle,
          label: part.name || '配件照片',
          note: trimNote(node.note),
          url,
          kind: 'part',
          priority: stage.id === focusStageId ? 0 : 1,
          order: 0,
        })
      })
    }

    resolveProcessImagesForStage(node, evidenceItems)
      .slice(0, stage.id === focusStageId ? 3 : 2)
      .forEach((url, idx) => {
        candidates.push({
          stageId: stage.id,
          stageTitle,
          label: '过程照片',
          note: trimNote(node.note),
          url,
          kind: 'process',
          priority: stage.id === focusStageId ? 0 : 2,
          order: idx,
        })
      })
  })

  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    const ai = SERVICE_ALBUM_STAGES.findIndex((s) => s.id === a.stageId)
    const bi = SERVICE_ALBUM_STAGES.findIndex((s) => s.id === b.stageId)
    if (ai !== bi) return ai - bi
    return a.order - b.order
  })

  const seen = new Set()
  const picked = []
  for (const item of candidates) {
    if (seen.has(item.url)) continue
    seen.add(item.url)
    picked.push(item)
    if (picked.length >= maxTotal) break
  }
  return picked
}

module.exports = {
  buildInspectionTimelineContext,
  buildStageTimeline,
  collectVisionImageCandidates,
  resolveFocusStageMeta,
}
