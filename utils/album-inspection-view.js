const { buildAlbumComparePairs } = require('./album-compare-pairs')
const { buildInspectionViews } = require('./album-inspection-matrix')
const {
  resolveOwnerImportance,
  bumpStrengthForAccident,
  resolveDocumentTypesForTemplate,
  resolveProcessChecklist,
} = require('../constants/album-evidence-guide')

function findNode(nodes, stageId) {
  return (nodes || []).find((n) => n && (n.id === stageId || n.nodeId === stageId))
}

function nodeImages(node) {
  if (!node) return []
  return (node.images || []).map((url) => String(url || '').trim()).filter(Boolean)
}

function buildDocumentItems(detail = {}) {
  const templateId = detail.templateId || ''
  const nodes = detail.nodes || []
  const structured = Array.isArray(detail.evidenceItems) ? detail.evidenceItems : []
  const types = resolveDocumentTypesForTemplate(templateId)
  return types.map((def) => {
    const structuredItem = structured.find((item) => item && item.id === def.id)
    const images = structuredItem
      ? (structuredItem.images || []).map((url) => String(url || '').trim()).filter(Boolean)
      : nodeImages(findNode(nodes, def.stageId))
    const strength = bumpStrengthForAccident(def.strength, templateId)
    return {
      id: def.id,
      label: def.label,
      stageId: def.stageId,
      strength,
      importanceLabel: resolveOwnerImportance(strength),
      images,
      uploaded: images.length > 0,
    }
  })
}

function buildProcessItems(detail = {}) {
  const templateId = detail.templateId || ''
  const checklist = resolveProcessChecklist(templateId)
  return checklist.map((item) => ({
    id: item.id,
    label: item.label,
    stageId: item.stageId,
  }))
}

function buildOutcomeBlock(detail = {}) {
  const nodes = detail.nodes || []
  const completeNode = findNode(nodes, 'stage_6')
  const completionImages = nodeImages(completeNode)
  const comparePairs = buildAlbumComparePairs(nodes, {
    templateId: detail.templateId,
    templateName: detail.templateName,
    serviceName: detail.serviceName,
  })
  return {
    completionImages,
    comparePairs,
    hasCompare: comparePairs.length > 0,
  }
}

function buildAlbumInspectionView(detail = {}) {
  const documentItems = buildDocumentItems(detail)
  const processItems = buildProcessItems(detail)
  const outcome = buildOutcomeBlock(detail)
  const views = buildInspectionViews(detail, documentItems, processItems, outcome)

  const showPartVerifyEntry =
    (detail.parts || []).length > 0 ||
    views.completeness.panels.some((p) => p.id === 'parts' && (p.rows || []).length)

  return {
    completeness: views.completeness,
    method: views.method,
    outcome,
    showPartVerifyEntry,
  }
}

module.exports = {
  buildAlbumInspectionView,
  buildDocumentItems,
  buildProcessItems,
  buildOutcomeBlock,
}
