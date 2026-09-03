/**
 * DOC-FLOW · 服务相册事件节点链（拍照节点 + 单据节点）
 * 真源文档：docs/04_维修过程相册/26_商家端事件节点与单据节点链流程.md
 */
const FLOW_VERSION = 2

const NODE_CATEGORY = {
  PHOTO: 'photo',
  DOCUMENT: 'document',
}

/** 标准链（接车+检测合并 · 8 步） */
const STANDARD_FLOW_CHAIN = [
  {
    kind: 'intake_inspection',
    nodeCategory: NODE_CATEGORY.PHOTO,
    title: '接车与检测',
    legacyStageIds: ['stage_1', 'stage_2'],
    photoTips: '接车拍里程与外观；检测拍故障点、读数与对比图',
    captionPlaceholder: '本图说明',
    description: '上传接车、检测照片，填写检测说明，确认后生成本单检测报告。',
  },
  {
    kind: 'inspection_report',
    nodeCategory: NODE_CATEGORY.DOCUMENT,
    title: '检测报告',
    docType: 'inspection_report',
    requiresConfirm: true,
  },
  {
    kind: 'quote_confirm',
    nodeCategory: NODE_CATEGORY.DOCUMENT,
    title: '报价确认单',
    docType: 'quote_confirm',
    requiresConfirm: true,
  },
  {
    kind: 'work_order',
    nodeCategory: NODE_CATEGORY.DOCUMENT,
    title: '工单',
    docType: 'work_order',
    requiresConfirm: false,
  },
  {
    kind: 'work',
    nodeCategory: NODE_CATEGORY.PHOTO,
    title: '施工',
    legacyStageIds: ['stage_5'],
    photoTips: '建议拍摄拆卸、安装、新旧对比、配件编码等',
    captionPlaceholder: '本图说明（选填）',
  },
  {
    kind: 'delivery_photos',
    nodeCategory: NODE_CATEGORY.PHOTO,
    title: '完工照',
    legacyStageIds: ['stage_6'],
    photoTips: '建议拍摄试车说明、交车外观',
    captionPlaceholder: '本图说明（验收结论等，勿写金额）',
  },
  {
    kind: 'repair_report',
    nodeCategory: NODE_CATEGORY.DOCUMENT,
    title: '维修报告',
    docType: 'repair_report',
    requiresConfirm: false,
  },
  {
    kind: 'warranty',
    nodeCategory: NODE_CATEGORY.DOCUMENT,
    title: '质保单',
    docType: 'warranty',
    requiresConfirm: false,
  },
]

const FLOW_KIND_META = STANDARD_FLOW_CHAIN.reduce((acc, row) => {
  acc[row.kind] = row
  return acc
}, {})

const PHOTO_KIND_TO_LEGACY_STAGE = STANDARD_FLOW_CHAIN.reduce((acc, row) => {
  if (row.legacyStageIds && row.legacyStageIds.length === 1) {
    acc[row.kind] = row.legacyStageIds[0]
  }
  return acc
}, {})

function newFlowNodeId(index) {
  return `fn_${String(index + 1).padStart(3, '0')}`
}

function emptyDocument(docType) {
  return {
    docType: docType || '',
    status: 'draft',
    payload: {},
    confirmedAt: '',
    confirmedBy: '',
    proxyProofImages: [],
    sourceNodeIds: [],
  }
}

function buildStandardFlowNodes() {
  return STANDARD_FLOW_CHAIN.map((meta, index) => ({
    id: newFlowNodeId(index),
    kind: meta.kind,
    nodeCategory: meta.nodeCategory,
    sortOrder: index,
    title: meta.title,
    status: index === 0 ? 'in_progress' : 'locked',
    photos: [],
    note: '',
    document:
      meta.nodeCategory === NODE_CATEGORY.DOCUMENT
        ? emptyDocument(meta.docType || meta.kind)
        : null,
    legacyStageId: meta.legacyStageIds && meta.legacyStageIds.length === 1
      ? meta.legacyStageIds[0]
      : '',
    legacyStageIds: meta.legacyStageIds || [],
    insertedReason: '',
    parentNodeId: '',
    segmentLabel: '',
  }))
}

function getFlowKindMeta(kind) {
  return FLOW_KIND_META[kind] || null
}

function isPhotoFlowNode(node = {}) {
  if (node.nodeCategory === NODE_CATEGORY.PHOTO) return true
  if (node.legacyStageId || (node.legacyStageIds && node.legacyStageIds.length)) return true
  return Boolean(PHOTO_KIND_TO_LEGACY_STAGE[node.kind])
}

function isDocumentFlowNode(node = {}) {
  return node.nodeCategory === NODE_CATEGORY.DOCUMENT || Boolean(node.document)
}

function resolveLegacyStageIdsForFlowNode(node = {}) {
  if (Array.isArray(node.legacyStageIds) && node.legacyStageIds.length) {
    return node.legacyStageIds
  }
  if (node.legacyStageId) return [node.legacyStageId]
  const meta = getFlowKindMeta(node.kind)
  if (meta && meta.legacyStageIds) return meta.legacyStageIds
  const single = PHOTO_KIND_TO_LEGACY_STAGE[node.kind]
  return single ? [single] : []
}

function resolveLegacyStageIdForFlowNode(node = {}) {
  const ids = resolveLegacyStageIdsForFlowNode(node)
  return ids[0] || ''
}

function requiresOwnerConfirm(node = {}) {
  const meta = getFlowKindMeta(node.kind)
  if (meta && meta.requiresConfirm) return true
  const doc = node.document
  return doc && (doc.docType === 'quote_confirm' || doc.docType === 'addon_quote_confirm')
}

module.exports = {
  FLOW_VERSION,
  NODE_CATEGORY,
  STANDARD_FLOW_CHAIN,
  FLOW_KIND_META,
  PHOTO_KIND_TO_LEGACY_STAGE,
  buildStandardFlowNodes,
  getFlowKindMeta,
  isPhotoFlowNode,
  isDocumentFlowNode,
  resolveLegacyStageIdForFlowNode,
  resolveLegacyStageIdsForFlowNode,
  requiresOwnerConfirm,
  emptyDocument,
  newFlowNodeId,
}
