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
 * 交车验收项（2026-11-10 二次收敛定稿）
 * 真源：docs/04_维修过程相册/26_ §6.2 acceptanceItems
 * 一行 = 一个施工项目（kind=work）或「外观」（kind=exterior，固定最后一行）
 * 每行只有：图片(images[]) + 结果(result) + 验收描述(note)；不再有标准/怎么验
 * 结果由店员确认；AI 逐行给建议结果与描述，点应用才写入，写入后仍可改。有 rework 硬拦交车定稿。
 */
const ACCEPTANCE_RESULT = {
  PASS: 'pass',
  OBSERVE: 'observe',
  REWORK: 'rework',
}

const ACCEPTANCE_RESULT_OPTIONS = [
  { value: ACCEPTANCE_RESULT.PASS, label: '合格' },
  { value: ACCEPTANCE_RESULT.OBSERVE, label: '建议观察' },
  { value: ACCEPTANCE_RESULT.REWORK, label: '需返工' },
]

/** 验收项类别：施工项目 / 外观（外观固定为清单最后一行） */
const ACCEPTANCE_KIND = {
  WORK: 'work',
  EXTERIOR: 'exterior',
}

/** 外观行的固定标识与名称 */
const ACCEPTANCE_EXTERIOR_ID = 'exterior'
const ACCEPTANCE_EXTERIOR_NAME = '外观'
/** 外观图上限（首张为整车外观，至少 1 张） */
const ACCEPTANCE_EXTERIOR_MAX = 3
/** 施工项图片上限 */
const ACCEPTANCE_ITEM_MAX_IMAGES = 6

function isValidAcceptanceResult(value) {
  return ACCEPTANCE_RESULT_OPTIONS.some((row) => row.value === value)
}

/** 验收项工厂：产出全部业务字段，不留半空对象（name 由调用方填入） */
function emptyAcceptanceItem(overrides = {}) {
  const patch = overrides && typeof overrides === 'object' ? overrides : {}
  const kind = patch.kind === ACCEPTANCE_KIND.EXTERIOR ? ACCEPTANCE_KIND.EXTERIOR : ACCEPTANCE_KIND.WORK
  const isExterior = kind === ACCEPTANCE_KIND.EXTERIOR
  return {
    id: String(patch.id || (isExterior ? ACCEPTANCE_EXTERIOR_ID : '')).trim(),
    kind,
    name: String(patch.name || (isExterior ? ACCEPTANCE_EXTERIOR_NAME : '')).trim(),
    images: Array.isArray(patch.images) ? patch.images : [],
    result: isValidAcceptanceResult(patch.result) ? patch.result : '',
    note: String(patch.note || '').trim(),
  }
}

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
const QUOTE_CONFIRM_COPY_TEARDOWN =
  '本人同意按上述项目施工（含约定拆检）。拆检后如有增减，须再确认。费用以各次确认单为准。'

/** 完工确认 · 车主确认固定文案（协议句，商家不可改） */
const REPAIR_CONFIRM_COPY = '本人确认上述施工与交车状态，并知悉质保条款。'
const INTAKE_CONFIRM_COPY = '本人确认以上为车辆进店时的可见状态与随车物品。'

const PHOTO_FLOW_KINDS = {
  intake: true,
  inspection: true,
  intake_inspection: true,
  work: true,
  delivery_photos: true,
}

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
    photoTips: '漆面、玻璃、轮胎、灯光、随车物品',
    captionPlaceholder: '本图说明（选填）',
    description: '',
  },
  {
    // 检测＝细查：故障与外观的部位级检查，结论进检测报告
    kind: 'inspection',
    nodeCategory: NODE_CATEGORY.PHOTO,
    title: '检测',
    photoTips: '',
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
    photoTips: '',
    captionPlaceholder: '本图说明（选填）',
  },
  {
    kind: 'delivery_photos',
    nodeCategory: NODE_CATEGORY.PHOTO,
    title: '完工照',
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
    deliveryPhotos: [],
    repairBrief: '',
    ownerFaqs: [],
    acceptanceItems: [],
  }
}

/**
 * 接车步草稿工厂
 * 接车只承载留证：问诊登记 / 里程表+当前里程 / 外观灯光选传。
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
    content:
      meta.nodeCategory === NODE_CATEGORY.PHOTO
        ? meta.kind === 'intake'
          ? emptyIntakeDraft()
          : emptyPhotoDraft()
        : emptyPhotoDraft(),
    document:
      meta.nodeCategory === NODE_CATEGORY.DOCUMENT
        ? emptyDocument(meta.docType || meta.kind)
        : null,
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
  return Boolean(PHOTO_FLOW_KINDS[node.kind])
}

function isDocumentFlowNode(node = {}) {
  return node.nodeCategory === NODE_CATEGORY.DOCUMENT || Boolean(node.document)
}

/** 需车主确认：方案确认、完工确认（及增项方案）。接车照片只发给车主看。 */
function requiresOwnerConfirm(node = {}) {
  const docType = (node.document && node.document.docType) || ''
  if (docType === 'intake_confirm') return false
  const meta = getFlowKindMeta(node.kind)
  if (meta && typeof meta.requiresConfirm === 'boolean') return meta.requiresConfirm
  return ['quote_confirm', 'repair_report', 'addon_quote_confirm'].includes(docType || node.kind)
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
  ACCEPTANCE_RESULT,
  ACCEPTANCE_RESULT_OPTIONS,
  ACCEPTANCE_KIND,
  ACCEPTANCE_EXTERIOR_ID,
  ACCEPTANCE_EXTERIOR_NAME,
  ACCEPTANCE_EXTERIOR_MAX,
  ACCEPTANCE_ITEM_MAX_IMAGES,
  isValidAcceptanceResult,
  emptyAcceptanceItem,
  QUOTE_CONFIRM_COPY,
  QUOTE_CONFIRM_COPY_TEARDOWN,
  REPAIR_CONFIRM_COPY,
  INTAKE_CONFIRM_COPY,
  PHOTO_FLOW_KINDS,
  isValidFindingResult,
  findingAdviceRequired,
  ownerFindingResultLabel,
  STANDARD_FLOW_CHAIN,
  FLOW_KIND_META,
  buildStandardFlowNodes,
  getFlowKindMeta,
  isPhotoFlowNode,
  isDocumentFlowNode,
  requiresOwnerConfirm,
  emptyDocument,
  emptyPhotoDraft,
  emptyIntakeDraft,
  newFlowNodeId,
}
