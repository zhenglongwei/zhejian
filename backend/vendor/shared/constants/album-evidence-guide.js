/**
 * 服务相册 · 证据清单与车主检查指南（商家提示 + 车主检查同源）
 * 定损单 stage_3；施工工单 stage_5；结算单 stage_6
 */

const EVIDENCE_CATEGORY = {
  DOCUMENT: 'document',
  PART: 'part',
  OLD_PART: 'old_part',
  PROCESS: 'process',
  OUTCOME: 'outcome',
}

/** B-EVID-06 · 阶段五旧件留痕（与单据槽、过程图分桶） */
const OLD_PART_TRACE_TYPE = 'old_part_trace'
const OLD_PART_TRACE_LABEL = '旧件留痕'
const OLD_PART_TRACE_STAGE_ID = 'stage_5'
const OLD_PART_TRACE_MAX_COUNT = 9
const MERCHANT_OLD_PART_INTRO =
  '更换类项目建议上传旧件或拆下照片；可多张。需要时可点选对应配件名称，便于车主核对；不选也可保存。'

const EVIDENCE_STRENGTH = {
  OPTIONAL: 'optional',
  RECOMMENDED: 'recommended',
  STRONGLY_RECOMMENDED: 'strongly_recommended',
}

const STRENGTH_LABEL = {
  optional: '可选',
  recommended: '建议',
  strongly_recommended: '强烈建议',
}

const STRENGTH_VARIANT = {
  optional: 'default',
  recommended: 'info',
  strongly_recommended: 'warning',
}

/** 车主检查 · 完整性 Tab「重要度」列（非商家必传/非用户必看） */
const IMPORTANCE_LABEL = {
  strongly_recommended: '关键',
  recommended: '一般',
  optional: '可选',
}

const COMPLETENESS_TAB_HINT =
  '「重要度」表示缺该项时对核对有多关键，不是要求你必须查看，也不表示门店一定已上传。'

const METHOD_TAB_HINT =
  '下面分三部分说明怎么核对；标红的是当前相册里需要留意的问题。'

/** 商家编辑页 · 留痕自检（A-MCH-INSP-01） */
const MERCHANT_INSPECTION_HINT =
  '「规范」表示本相册建议留痕程度（必留/建议留/可选）；缺项不会阻断保存或完工，但会影响车主核对体验。'

const MERCHANT_COMPLETE_INSP_TITLE = '关键留痕未齐'
const MERCHANT_COMPLETE_INSP_INTRO =
  '以下「必留」项尚未上传，建议先补传再标记完工。缺项不会阻断完工，但会影响车主核对。'

const MERCHANT_EVIDENCE_LABEL = {
  strongly_recommended: '必留',
  recommended: '建议留',
  optional: '可选',
}

/** 车主检查页 · 专业顺序 */
const INSPECTION_SECTIONS = [
  {
    id: 'documents',
    order: 1,
    title: '单据检查',
    intro: '按施工时间线核对：定损与报价（施工前）→ 工单（施工中）→ 结算（交车时）。以下仅为辅助查看，平台不认定单据真伪。',
  },
  {
    id: 'parts',
    order: 2,
    title: '配件检查',
    intro: '对照登记配件的类型、编码与凭证图；涉及更换时建议查看是否有旧件外观留痕。可跳转「配件验真」按编码自行查询。',
  },
  {
    id: 'process',
    order: 3,
    title: '过程检查',
    intro: '底盘、内部结构、钣喷等施工过程肉眼难核对，建议查看门店是否留有对应环节照片。',
  },
  {
    id: 'outcome',
    order: 4,
    title: '完工与对比',
    intro: '查看完工效果；若门店上传了完整前后配对，可使用滑块对比同一角度变化。',
  },
]

const DOCUMENT_TYPES = {
  loss_assessment: {
    id: 'loss_assessment',
    category: EVIDENCE_CATEGORY.DOCUMENT,
    label: '定损单',
    stageId: 'stage_3',
    templates: ['accident'],
    strength: EVIDENCE_STRENGTH.STRONGLY_RECOMMENDED,
    merchantHint:
      '保险公司核损完成、正式施工前的定损单据。应包含理赔项目范围、配件标准、工时单价与理赔总额。',
    ownerCheckHint:
      '核对定损项目是否覆盖本次事故损伤部位；总额通常为保险理赔支付上限。',
    anomalyHint: '定损项目与接车/检测可见损伤明显不符，或缺少关键部位项目。',
    actionHint: '向门店或保险公司核对定损范围；保留纸质/电子定损单。',
  },
  repair_quote: {
    id: 'repair_quote',
    category: EVIDENCE_CATEGORY.DOCUMENT,
    label: '维修报价单',
    stageId: 'stage_3',
    templates: ['*'],
    strength: EVIDENCE_STRENGTH.STRONGLY_RECOMMENDED,
    merchantHint: '门店施工方案与费用报价；可与报价 OCR 目录、方案报价金额一并留痕。',
    ownerCheckHint: '核对项目、配件类型与金额是否与沟通一致；事故车可与定损单对照差异原因。',
    anomalyHint: '报价主要项目与定损差异大，或金额明显超出定损总额且无说明。',
    actionHint: '要求门店说明自费/增项部分；保留报价单照片。',
  },
  work_order: {
    id: 'work_order',
    category: EVIDENCE_CATEGORY.DOCUMENT,
    label: '施工工单',
    stageId: 'stage_5',
    templates: ['*'],
    strength: EVIDENCE_STRENGTH.RECOMMENDED,
    merchantHint: '派工/施工工单，含工项、工时或配件摘要；建议在正式施工过程中上传。',
    ownerCheckHint: '核对工项是否与报价/定损对应；是否出现未告知的增项。',
    anomalyHint: '工单项目较报价明显增加，或工项描述与后续结算不一致。',
    actionHint: '施工中途或交车前向门店确认增项原因并留痕。',
  },
  settlement: {
    id: 'settlement',
    category: EVIDENCE_CATEGORY.DOCUMENT,
    label: '维修结算单',
    stageId: 'stage_6',
    templates: ['*'],
    strength: EVIDENCE_STRENGTH.RECOMMENDED,
    merchantHint: '交车结算单据，含实付金额与项目汇总。',
    ownerCheckHint: '核对结算与报价/工单是否一致；有无未告知增项或重复收费。',
    anomalyHint: '结算金额高于报价且无书面或沟通说明；项目数量对不上。',
    actionHint: '先与门店沟通；必要时保留结算单并通过正规投诉渠道反映。',
  },
}

const PROCESS_CHECKLIST_BY_TEMPLATE = {
  accident: [
    { id: 'accident_teardown', label: '拆解/测量过程', stageId: 'stage_5' },
    { id: 'accident_repair', label: '修复/更换关键点', stageId: 'stage_5' },
    { id: 'accident_reassembly', label: '复装完成', stageId: 'stage_5' },
  ],
  body_paint: [
    { id: 'bp_metal', label: '钣金修复点', stageId: 'stage_5' },
    { id: 'bp_coating', label: '腻子/中涂/遮蔽', stageId: 'stage_5' },
    { id: 'bp_paint', label: '面漆/抛光', stageId: 'stage_5' },
  ],
  default: [
    { id: 'proc_remove', label: '旧件拆下或故障部位', stageId: 'stage_5' },
    { id: 'proc_install', label: '新件装复或施工关键步骤', stageId: 'stage_5' },
    { id: 'proc_done', label: '施工完成状态', stageId: 'stage_5' },
  ],
}

const INSPECTION_DISCLAIMER = '辅助查看，不构成鉴定结论。'

/** AI 结果区标题下首行免责 */
const AI_INSPECTION_DISCLAIMER =
  '以下为 AI 辅助检查建议，不构成鉴定结论或质量裁决；可能存在遗漏或误判，请以实际单据与现场情况为准。'

/**
 * 相册证据能力边界（汽修专家口径 · 结果区固定展示）
 * 即便单据图文一致，也不能排除造假；相册仅提高留痕对照与作假成本。
 */
const AI_INSPECTION_EVIDENCE_LIMIT_LINES = [
  '相册能帮你对照单据、照片与维修流程是否说得通，也能提高门店作假留痕的成本；但即便各项核对一致，也不能保证维修一定没有造假（例如未拍照环节、旧件事后替换、账外施工等相册无法覆盖的情形）。',
  '若要尽可能接近全程可信，通常只有两种方式：全程在场见证施工，或事后委托有资质的第三方鉴定。事故维修如有怀疑，可向承保保险公司申请复检，或反映定损与施工不符之处。',
]

const AI_INSPECTION_CONSENT =
  '将使用本相册的结构化信息与部分照片（经服务端读取后生成文字说明，不向外发送原图）生成 AI 检查建议。平台不负责鉴定配件真伪；即便单据图文全部对得上，也不能排除造假可能，相册仅能提高作假成本。是否继续？'

function templateMatches(typeDef, templateId) {
  const tpl = String(templateId || '').trim() || 'default'
  const list = typeDef.templates || []
  if (list.includes('*')) return true
  return list.includes(tpl)
}

function resolveDocumentTypesForTemplate(templateId) {
  return Object.values(DOCUMENT_TYPES).filter((def) => templateMatches(def, templateId))
}

function resolveProcessChecklist(templateId) {
  const tpl = String(templateId || '').trim()
  if (PROCESS_CHECKLIST_BY_TEMPLATE[tpl]) return PROCESS_CHECKLIST_BY_TEMPLATE[tpl]
  if (tpl === 'body_paint') return PROCESS_CHECKLIST_BY_TEMPLATE.body_paint
  if (tpl === 'accident') return PROCESS_CHECKLIST_BY_TEMPLATE.accident
  return PROCESS_CHECKLIST_BY_TEMPLATE.default
}

function bumpStrengthForAccident(strength, templateId) {
  if (templateId !== 'accident') return strength
  if (strength === EVIDENCE_STRENGTH.RECOMMENDED) {
    return EVIDENCE_STRENGTH.STRONGLY_RECOMMENDED
  }
  return strength
}

function resolveOwnerImportance(strength) {
  return IMPORTANCE_LABEL[strength] || IMPORTANCE_LABEL.recommended
}

function resolveMerchantEvidenceLabel(strength) {
  return MERCHANT_EVIDENCE_LABEL[strength] || MERCHANT_EVIDENCE_LABEL.recommended
}

function resolveImportanceLabel(strength, audience = 'owner') {
  if (audience === 'merchant') {
    return resolveMerchantEvidenceLabel(strength)
  }
  return resolveOwnerImportance(strength)
}

module.exports = {
  EVIDENCE_CATEGORY,
  OLD_PART_TRACE_TYPE,
  OLD_PART_TRACE_LABEL,
  OLD_PART_TRACE_STAGE_ID,
  OLD_PART_TRACE_MAX_COUNT,
  MERCHANT_OLD_PART_INTRO,
  EVIDENCE_STRENGTH,
  STRENGTH_LABEL,
  STRENGTH_VARIANT,
  IMPORTANCE_LABEL,
  MERCHANT_EVIDENCE_LABEL,
  COMPLETENESS_TAB_HINT,
  METHOD_TAB_HINT,
  MERCHANT_INSPECTION_HINT,
  MERCHANT_COMPLETE_INSP_TITLE,
  MERCHANT_COMPLETE_INSP_INTRO,
  INSPECTION_SECTIONS,
  DOCUMENT_TYPES,
  PROCESS_CHECKLIST_BY_TEMPLATE,
  INSPECTION_DISCLAIMER,
  AI_INSPECTION_DISCLAIMER,
  AI_INSPECTION_EVIDENCE_LIMIT_LINES,
  AI_INSPECTION_CONSENT,
  templateMatches,
  resolveDocumentTypesForTemplate,
  resolveProcessChecklist,
  bumpStrengthForAccident,
  resolveOwnerImportance,
  resolveMerchantEvidenceLabel,
  resolveImportanceLabel,
}
