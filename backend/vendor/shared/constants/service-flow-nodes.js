/**
 * DOC-FLOW · 服务相册事件节点链（拍照节点 + 单据节点）
 * 真源：docs/04_维修过程相册/26_商家端事件节点与单据节点链流程.md
 */
const FLOW_VERSION = 3

const NODE_CATEGORY = {
  PHOTO: 'photo',
  DOCUMENT: 'document',
}

const INSPECTION_DISCLAIMER =
  '本次说明仅针对已拍摄部位；未拍照部位不构成全车体检结论。'

/** 标准链（7 步 · 质保并入维修报告） */
const STANDARD_FLOW_CHAIN = [
  {
    kind: 'intake_inspection',
    nodeCategory: NODE_CATEGORY.PHOTO,
    title: '接车与检测',
    legacyStageIds: ['stage_2'],
    photoTips: '里程、外观、故障点统一上传；每张写清部位、现象、结果与处理建议',
    captionPlaceholder: '检查部位/项目',
    description: '本步写齐主诉与发现项（统一照片入口）；确认后自动生成完整检测报告（之后可微调）。',
  },
  {
    kind: 'inspection_report',
    nodeCategory: NODE_CATEGORY.DOCUMENT,
    title: '检测报告',
    docType: 'inspection_report',
    requiresConfirm: true,
    description: '核对并微调检测报告后发给车主确认。',
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
    photoTips: '拆卸、安装、新旧对比；每张写本图说明',
    captionPlaceholder: '本图说明（选填）',
  },
  {
    kind: 'delivery_photos',
    nodeCategory: NODE_CATEGORY.PHOTO,
    title: '完工照',
    legacyStageIds: ['stage_6'],
    photoTips: '试车、交车外观；每张写本图说明，并填写质保要点',
    captionPlaceholder: '本图说明（验收结论等，勿写金额）',
    description: '本步上传完工照并填写质保；确认后自动生成完整维修报告（之后可微调）。',
  },
  {
    kind: 'repair_report',
    nodeCategory: NODE_CATEGORY.DOCUMENT,
    title: '维修报告（含质保）',
    docType: 'repair_report',
    requiresConfirm: true,
    description: '核对并微调维修报告与质保后发给车主确认。',
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
    contentFingerprint: '',
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
    legacyStageId:
      meta.legacyStageIds && meta.legacyStageIds.length === 1
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
  if (!doc) return false
  return ['inspection_report', 'quote_confirm', 'repair_report', 'addon_quote_confirm'].includes(
    doc.docType || node.kind,
  )
}

module.exports = {
  FLOW_VERSION,
  NODE_CATEGORY,
  INSPECTION_DISCLAIMER,
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
