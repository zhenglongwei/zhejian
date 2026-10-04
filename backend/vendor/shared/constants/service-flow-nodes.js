/**
 * DOC-FLOW · 服务相册事件节点链（拍照节点 + 单据节点）
 * 真源：docs/04_维修过程相册/26_商家端事件节点与单据节点链流程.md
 */
const FLOW_VERSION = 6

const NODE_CATEGORY = {
  PHOTO: 'photo',
  DOCUMENT: 'document',
}

const INSPECTION_DISCLAIMER =
  '本次说明仅针对已拍摄部位；未拍照部位不构成全车体检结论。'

/** 发现项检查结果（点选，非自由文本） */
const FINDING_RESULT = {
  OK: '状态良好',
  WATCH: '需关注',
  ACTION: '需处理',
  RECORD: '仅记录',
}

const FINDING_RESULT_OPTIONS = [
  { value: FINDING_RESULT.OK, shortLabel: '良好' },
  { value: FINDING_RESULT.WATCH, shortLabel: '关注' },
  { value: FINDING_RESULT.ACTION, shortLabel: '待处理' },
  { value: FINDING_RESULT.RECORD, shortLabel: '记录' },
]

const FINDING_ADVICE_NONE = '无需处理'

/**
 * 接车 · 环车清单（存量只读兼容）
 * 新单不再作为拍前勾选，改用 INTAKE_RECORD_CATEGORIES。
 */
const WALKAROUND_PARTS = [
  { id: 'front_bumper', label: '前保险杠' },
  { id: 'hood', label: '引擎盖' },
  { id: 'left_front_fender', label: '左前翼子板' },
  { id: 'left_front_door', label: '左前门' },
  { id: 'left_rear_door', label: '左后门' },
  { id: 'left_rear_fender', label: '左后翼子板' },
  { id: 'rear_bumper', label: '后保险杠' },
  { id: 'trunk', label: '后备箱盖' },
  { id: 'right_rear_fender', label: '右后翼子板' },
  { id: 'right_rear_door', label: '右后门' },
  { id: 'right_front_door', label: '右前门' },
  { id: 'right_front_fender', label: '右前翼子板' },
  { id: 'roof', label: '车顶' },
  { id: 'odometer', label: '仪表（里程）' },
]

/** 接车结果类目：整理后摊图 / 读数核对。不做正常/破损判定。 */
const INTAKE_RECORD_CATEGORIES = [
  { id: 'odometer', label: '里程', needsVerify: true, unit: 'km' },
  { id: 'fuel', label: '油量', needsVerify: true, unit: '' },
  { id: 'paint', label: '漆面', needsVerify: false, unit: '' },
  { id: 'glass', label: '玻璃', needsVerify: false, unit: '' },
  { id: 'tire', label: '轮胎', needsVerify: false, unit: '' },
  { id: 'light', label: '灯光', needsVerify: false, unit: '' },
  { id: 'belongings', label: '随车物品', needsVerify: false, unit: '' },
]

/** 方案确认 · 车主确认固定文案（协议句，商家不可改） */
const QUOTE_CONFIRM_COPY = '本人同意按上述项目施工，费用以本单为准。'

/** 完工确认 · 车主确认固定文案（协议句，商家不可改） */
const REPAIR_CONFIRM_COPY = '本人确认上述施工与交车状态，并知悉质保条款。'

function isValidFindingResult(value) {
  return FINDING_RESULT_OPTIONS.some((row) => row.value === value)
}

function findingAdviceRequired(result) {
  return result === FINDING_RESULT.WATCH || result === FINDING_RESULT.ACTION
}

/** 车主面结果文案：仅记录不展示商家作业词 */
function ownerFindingResultLabel(result) {
  if (result === FINDING_RESULT.RECORD) return '已留证'
  return String(result || '')
}

/** 标准链（7 步 · 接车＝初始状态留证、检测＝故障与外观细查；工单＝如实记录施工过程的单据） */
const STANDARD_FLOW_CHAIN = [
  {
    // 接车＝留证：证明车辆进场时的初始状态，避免后续与车主就损伤/故障归属产生分歧。
    // 只拍不改判定：环车清单勾选「拍没拍到」，故障判定归检测节点
    kind: 'intake',
    nodeCategory: NODE_CATEGORY.PHOTO,
    title: '接车',
    legacyStageIds: ['stage_1'],
    photoTips: '连拍进场外观，把里程表拍进去',
    captionPlaceholder: '本图说明（选填）',
    description: '',
  },
  {
    // 检测＝细查：故障与外观的部位级检查，结论进检测报告
    kind: 'inspection',
    nodeCategory: NODE_CATEGORY.PHOTO,
    title: '检测',
    legacyStageIds: ['stage_2'],
    photoTips: '基础查：油液、故障灯、底盘、刹车、轮胎。连拍即可',
    captionPlaceholder: '检查部位',
    description: '',
  },
  {
    kind: 'inspection_report',
    nodeCategory: NODE_CATEGORY.DOCUMENT,
    title: '检测报告',
    docType: 'inspection_report',
    requiresConfirm: false,
    deliverable: true,
    description: '',
  },
  {
    kind: 'quote_confirm',
    nodeCategory: NODE_CATEGORY.DOCUMENT,
    title: '方案确认',
    docType: 'quote_confirm',
    requiresConfirm: true,
  },
  {
    // 工单＝如实记录施工过程的单据，不是报价派生出来的。
    // 数据仍由 photoDraft.findings 承载图文，故 nodeCategory 维持 PHOTO，
    // 以免重写拍照步的编辑链路；对外它就是一张单据
    kind: 'work',
    nodeCategory: NODE_CATEGORY.PHOTO,
    title: '工单',
    legacyStageIds: ['stage_5'],
    photoTips: '拍这次做成的项；每项写清项目与用料',
    captionPlaceholder: '本图说明（选填）',
  },
  {
    kind: 'delivery_photos',
    nodeCategory: NODE_CATEGORY.PHOTO,
    title: '完工照',
    legacyStageIds: ['stage_6'],
    photoTips: '拍车身全貌作交车证据',
    captionPlaceholder: '本图说明（验收结论等，勿写金额）',
    description: '',
  },
  {
    kind: 'repair_report',
    nodeCategory: NODE_CATEGORY.DOCUMENT,
    title: '完工确认',
    docType: 'repair_report',
    requiresConfirm: true,
    description: '',
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

/**
 * 过程步草稿工厂
 * 真源：docs/04_维修过程相册/26_ 商家端事件节点与单据节点链流程.md §6.2
 * 与 emptyDocument 对称：photo 类节点用它，避免节点对象只带容器字段 photos: []
 */
function emptyPhotoDraft() {
  return {
    chiefComplaint: '',
    mileageKm: '',
    odometerUrl: '',
    odometerImageId: '',
    vehicleBrand: '',
    vehicleSeries: '',
    vehicleYear: '',
    conclusion: '',
    findings: [],
    warrantyPeriod: '',
    warrantyNotes: '',
    confirmCopy: '',
    selectedDeliveryUrls: [],
    deliveryExteriorUrl: '',
  }
}

/**
 * 接车步草稿工厂
 * 接车只承载留证：问诊登记 / 品牌车型 / 连拍 / 接车结果读数。
 * **不承载 findings**（部位与故障判定属于检测节点）
 */
function emptyIntakeDraft() {
  return {
    chiefComplaint: '',
    mileageKm: '',
    fuelReading: '',
    odometerUrl: '',
    odometerImageId: '',
    vehicleBrand: '',
    vehicleSeries: '',
    vehicleYear: '',
    walkaround: [],
    intakeResults: [],
    pendingImages: [],
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
    photoDraft:
      meta.nodeCategory === NODE_CATEGORY.PHOTO
        ? meta.kind === 'intake'
          ? emptyIntakeDraft()
          : emptyPhotoDraft()
        : null,
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

/** 需车主确认：仅方案确认、完工确认（及增项方案） */
function requiresOwnerConfirm(node = {}) {
  const meta = getFlowKindMeta(node.kind)
  if (meta && typeof meta.requiresConfirm === 'boolean') return meta.requiresConfirm
  const docType = (node.document && node.document.docType) || node.kind
  return ['quote_confirm', 'repair_report', 'addon_quote_confirm'].includes(docType)
}

module.exports = {
  FLOW_VERSION,
  NODE_CATEGORY,
  INSPECTION_DISCLAIMER,
  FINDING_RESULT,
  FINDING_RESULT_OPTIONS,
  FINDING_ADVICE_NONE,
  WALKAROUND_PARTS,
  INTAKE_RECORD_CATEGORIES,
  QUOTE_CONFIRM_COPY,
  REPAIR_CONFIRM_COPY,
  isValidFindingResult,
  findingAdviceRequired,
  ownerFindingResultLabel,
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
  emptyPhotoDraft,
  emptyIntakeDraft,
  newFlowNodeId,
}
