/**
 * DOC-FLOW · 服务相册事件节点链（拍照节点 + 单据节点）
 * 真源文档：docs/04_维修过程相册/26_商家端事件节点与单据节点链流程.md
 */
const FLOW_VERSION = 1

const NODE_CATEGORY = {
  PHOTO: 'photo',
  DOCUMENT: 'document',
}

/** 标准链元数据（无增项） */
const STANDARD_FLOW_CHAIN = [
  {
    kind: 'intake',
    nodeCategory: NODE_CATEGORY.PHOTO,
    title: '接车',
    legacyStageId: 'stage_1',
    photoTips: '仪表里程表必拍；建议拍摄外观、故障部位',
    captionPlaceholder: '本图说明（里程表可写如：85231 公里）',
  },
  {
    kind: 'inspection',
    nodeCategory: NODE_CATEGORY.PHOTO,
    title: '检测',
    legacyStageId: 'stage_2',
    photoTips: '建议拍摄故障点、检测仪器读数、对比图',
    captionPlaceholder: '本图说明（现象 / 检查手段 / 结论）',
  },
  {
    kind: 'inspection_report',
    nodeCategory: NODE_CATEGORY.DOCUMENT,
    title: '检测报告',
    docType: 'inspection_report',
    requiresConfirm: false,
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
    legacyStageId: 'stage_5',
    photoTips: '建议拍摄拆卸、安装、新旧对比、配件编码等',
    captionPlaceholder: '本图说明（选填）',
  },
  {
    kind: 'delivery_photos',
    nodeCategory: NODE_CATEGORY.PHOTO,
    title: '完工照',
    legacyStageId: 'stage_6',
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

const PHOTO_KIND_TO_LEGACY_STAGE = STANDARD_FLOW_CHAIN.filter((r) => r.legacyStageId).reduce(
  (acc, row) => {
    acc[row.kind] = row.legacyStageId
    return acc
  },
  {},
)

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
    status: index === 0 ? 'in_progress' : 'pending',
    photos: [],
    document:
      meta.nodeCategory === NODE_CATEGORY.DOCUMENT
        ? emptyDocument(meta.docType || meta.kind)
        : null,
    legacyStageId: meta.legacyStageId || '',
    insertedReason: '',
    parentNodeId: '',
    segmentLabel: '',
  }))
}

function getFlowKindMeta(kind) {
  return FLOW_KIND_META[kind] || null
}

function isPhotoFlowNode(node = {}) {
  return node.nodeCategory === NODE_CATEGORY.PHOTO || Boolean(node.legacyStageId)
}

function isDocumentFlowNode(node = {}) {
  return node.nodeCategory === NODE_CATEGORY.DOCUMENT || Boolean(node.document)
}

function resolveLegacyStageIdForFlowNode(node = {}) {
  if (node.legacyStageId) return node.legacyStageId
  return PHOTO_KIND_TO_LEGACY_STAGE[node.kind] || ''
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
  requiresOwnerConfirm,
  emptyDocument,
  newFlowNodeId,
}
