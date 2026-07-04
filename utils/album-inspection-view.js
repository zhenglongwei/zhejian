const { buildAlbumComparePairs } = require('./album-compare-pairs')
const {
  INSPECTION_SECTIONS,
  STRENGTH_LABEL,
  STRENGTH_VARIANT,
  bumpStrengthForAccident,
  resolveDocumentTypesForTemplate,
  resolveProcessChecklist,
  INSPECTION_DISCLAIMER,
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
  const types = resolveDocumentTypesForTemplate(templateId)
  return types.map((def) => {
    const node = findNode(nodes, def.stageId)
    const images = nodeImages(node)
    const strength = bumpStrengthForAccident(def.strength, templateId)
    return {
      id: def.id,
      label: def.label,
      stageId: def.stageId,
      stageTitle: (node && node.title) || def.stageId,
      strength,
      strengthLabel: STRENGTH_LABEL[strength] || '',
      strengthVariant: STRENGTH_VARIANT[strength] || 'default',
      merchantHint: def.merchantHint,
      checkHint: def.ownerCheckHint,
      anomalyHint: def.anomalyHint,
      actionHint: def.actionHint,
      images,
      note: (node && node.note) || '',
      uploaded: images.length > 0,
      missing: images.length === 0,
    }
  })
}

function buildPartItems(detail = {}) {
  const parts = detail.parts || []
  return parts.map((part, index) => {
    const photos = []
    ;(part.photos || part.images || []).forEach((url) => {
      const value = String(url || '').trim()
      if (value) photos.push(value)
    })
    return {
      id: part.partId || `part_${index}`,
      label: part.partName || part.name || `配件 ${index + 1}`,
      partType: part.partType || '',
      partBrand: part.partBrand || part.brand || '',
      partCode: part.partCode || part.code || '',
      checkHint: '建议查看包装、编号标签与旧件外观（如有）；编码可复制至「配件验真」自行查询。',
      anomalyHint: '登记为更换但未见旧件或过程留痕；编码标签无法辨认。',
      actionHint: '使用相册「配件验真」留痕，或联系门店补充说明。',
      images: photos,
      uploaded: photos.length > 0,
      missing: photos.length === 0,
    }
  })
}

function buildProcessItems(detail = {}) {
  const templateId = detail.templateId || ''
  const nodes = detail.nodes || []
  const checklist = resolveProcessChecklist(templateId)
  const processNode = findNode(nodes, 'stage_5')
  const processImages = nodeImages(processNode)
  return checklist.map((item) => ({
    id: item.id,
    label: item.label,
    stageId: item.stageId,
    checkHint: '建议对照报价/定损项目，确认该环节是否有对应过程照片。',
    anomalyHint: '声称涉及该环节但相册中缺少过程图。',
    actionHint: '向门店询问是否可补传过程留痕。',
    images: processImages,
    note: (processNode && processNode.note) || '',
    uploaded: processImages.length > 0,
    sharedProcessImages: true,
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
    completionNote: (completeNode && completeNode.note) || '',
    comparePairs,
    hasCompare: comparePairs.length > 0,
    checkHint: '查看完工效果；有完整配对时可使用滑块对比同一角度前后变化。',
  }
}

function buildRuleHints(detail = {}, documentItems = []) {
  const hints = []
  documentItems.forEach((item) => {
    if (item.missing && item.strength === 'strongly_recommended') {
      hints.push({
        level: 'warning',
        text: `未见「${item.label}」留痕照片，建议向门店补充或线下索要单据核对。`,
      })
    }
  })
  const parts = detail.parts || []
  if (parts.length && parts.every((p) => !(p.photos || p.images || []).length)) {
    hints.push({
      level: 'info',
      text: '配件已登记但缺少凭证图，建议重点查看过程与完工留痕，或使用配件验真。',
    })
  }
  const processNode = findNode(detail.nodes, 'stage_5')
  if (!nodeImages(processNode).length) {
    hints.push({
      level: 'info',
      text: '未见施工过程照片，涉及隐藏施工或钣喷时建议向门店了解是否可补传。',
    })
  }
  return hints
}

function buildAlbumInspectionView(detail = {}) {
  const documentItems = buildDocumentItems(detail)
  const partItems = buildPartItems(detail)
  const processItems = buildProcessItems(detail)
  const outcome = buildOutcomeBlock(detail)
  const ruleHints = buildRuleHints(detail, documentItems)

  const sections = INSPECTION_SECTIONS.map((section) => {
    if (section.id === 'documents') {
      return { ...section, items: documentItems, empty: !documentItems.length }
    }
    if (section.id === 'parts') {
      return { ...section, items: partItems, empty: !partItems.length }
    }
    if (section.id === 'process') {
      return { ...section, items: processItems, empty: !processItems.length }
    }
    if (section.id === 'outcome') {
      return {
        ...section,
        outcome,
        empty: !outcome.completionImages.length && !outcome.hasCompare,
      }
    }
    return { ...section, items: [], empty: true }
  })

  return {
    disclaimer: INSPECTION_DISCLAIMER,
    sections,
    ruleHints,
    showPartVerifyEntry: partItems.length > 0,
  }
}

module.exports = {
  buildAlbumInspectionView,
  buildDocumentItems,
  buildPartItems,
  buildProcessItems,
  buildOutcomeBlock,
  buildRuleHints,
}
