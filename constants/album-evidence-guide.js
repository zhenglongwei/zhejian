/**
 * 服务相册 · 证据清单与车主检查指南（商家提示 + 车主检查同源）
 * ALB-UX：定损单挂接车；结算单 / 质保承诺 stage_6；已取消报价单/工单槽
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
const OLD_PART_TRACE_LABEL = '旧件照片'
const OLD_PART_TRACE_STAGE_ID = 'stage_5'
const OLD_PART_TRACE_MAX_COUNT = 9
const MERCHANT_OLD_PART_INTRO = '更换类项目可上传旧件或拆下照片，便于车主核对。'

/** B-PART · 施工增项 SOP（Phase 1 · 见 docs/04/11_施工增项留痕SOP.md） */
const MERCHANT_EXTRA_PART_SOP_STAGE3_HINT = '有增项？先取得客户确认，在本页补传增项/报价单，再到配件凭证登记。'
const MERCHANT_EXTRA_PART_SOP_STAGE4_HINT = '若配件和原方案不符，请先和客户沟通确认，然后上传最新的报价单。'
const MERCHANT_EXTRA_PART_SOP_LINK = '增项怎么做'
const MERCHANT_EXTRA_PART_SOP_MODAL_TITLE = '施工增项怎么做'
const MERCHANT_EXTRA_PART_SOP_MODAL_CONTENT =
  '1. 线下取得客户对增项的确认（签字单或沟通截图）。\n' +
  '2. 在「方案」补传增项/报价单，更新总额与配件目录。\n' +
  '3. 在「配件凭证」为新增项上传类型与凭证图。'

const EVIDENCE_STRENGTH = {
  OPTIONAL: 'optional',
  RECOMMENDED: 'recommended',
  STRONGLY_RECOMMENDED: 'strongly_recommended',
}

const STRENGTH_LABEL = {
  optional: '参考',
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
  optional: '参考',
}

const COMPLETENESS_TAB_HINT =
  '「重要度」表示缺该项时对核对有多关键，不是要求你必须查看，也不表示门店一定已上传。'

const METHOD_TAB_HINT =
  '下面分三部分说明怎么核对；标红的是当前相册里需要留意的问题。'

/** 商家编辑页 · 留痕自检（A-MCH-INSP-01） */
const MERCHANT_INSPECTION_HINT =
  '「建议」列表示完整程度（必拍/建议）；缺项不阻断保存或完工，但会影响车主核对。'

const MERCHANT_COMPLETE_INSP_TITLE = '建议补传后再完工'
const MERCHANT_COMPLETE_INSP_INTRO =
  '以下项尚未上传。缺项不阻断完工，但会影响车主核对与后续分析。'

const MERCHANT_EVIDENCE_LABEL = {
  strongly_recommended: '必拍',
  recommended: '建议',
  optional: '参考',
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
    stageId: 'stage_1',
    templates: ['accident'],
    strength: EVIDENCE_STRENGTH.STRONGLY_RECOMMENDED,
    merchantHint:
      '保险公司核损单据（事故车）。可在接车时上传；应包含理赔项目范围、配件标准、工时与理赔总额。',
    ownerCheckHint:
      '核对定损项目是否覆盖本次事故损伤部位；总额通常为保险理赔支付上限。',
    anomalyHint: '定损项目与接车/检测可见损伤明显不符，或缺少关键部位项目。',
    actionHint: '向门店或保险公司核对定损范围；保留纸质/电子定损单。',
  },
  settlement: {
    id: 'settlement',
    category: EVIDENCE_CATEGORY.DOCUMENT,
    label: '维修结算单',
    stageId: 'stage_6',
    templates: ['*'],
    strength: EVIDENCE_STRENGTH.RECOMMENDED,
    merchantHint: '交车结算单据（建议上传，非必须）：实付金额与项目汇总。',
    ownerCheckHint: '核对结算项目与沟通是否一致；有无未告知增项。',
    anomalyHint: '结算金额与沟通明显不符且无说明。',
    actionHint: '先与门店沟通；必要时保留结算单并通过正规投诉渠道反映。',
  },
  /** B-EVID-07 · 阶段六质保承诺（承诺书图优先；可文字兜底；强烈建议） */
  warranty: {
    id: 'warranty',
    category: EVIDENCE_CATEGORY.DOCUMENT,
    label: '质保承诺书',
    stageId: 'stage_6',
    templates: ['*'],
    strength: EVIDENCE_STRENGTH.STRONGLY_RECOMMENDED,
    merchantHint:
      '优先拍摄门店质保承诺书（裁切条款页，避开姓名电话）；无纸质承诺书时请填写下方时长、范围或说明。',
    ownerCheckHint: '核对质保时长与范围是否与交车沟通一致；有承诺书图可留存备查。',
    anomalyHint: '缺质保说明，交车后责任边界不清。',
    actionHint: '向门店确认质保时长、范围与注意事项，并要求书面或相册留档。',
  },
}

/** 质保承诺结构化字段（挂在 evidenceItems.warranty 上，无独立表） */
const WARRANTY_DOCUMENT_ID = 'warranty'
const WARRANTY_FIELD_MAX_LEN = {
  duration: 80,
  scope: 200,
  note: 300,
}
const MERCHANT_WARRANTY_INTRO =
  '优先上传质保承诺书照片；没有纸质承诺书时，请填写质保时长、范围或说明。公示前会脱敏。'
const MERCHANT_WARRANTY_DURATION_LABEL = '质保时长'
const MERCHANT_WARRANTY_DURATION_PLACEHOLDER = '如：漆面 2 年 / 配件 1 年（以门店承诺为准）'
const MERCHANT_WARRANTY_SCOPE_LABEL = '质保范围'
const MERCHANT_WARRANTY_SCOPE_PLACEHOLDER = '如：面漆起泡开裂；不含事故二次损伤与不当养护'
const MERCHANT_WARRANTY_NOTE_LABEL = '质保说明'
const MERCHANT_WARRANTY_NOTE_PLACEHOLDER =
  '无承诺书时可在此备注质保边界与注意事项；有承诺书也可补充口头告知要点'

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
 * 相册证据能力边界（汽修专家口径 · 供 LLM prompt / 旧版分段展示引用）
 * 页面展示请用 compliance-copy · aiInspection（AI_INSPECTION_PAGE_NOTICE）
 */
const AI_INSPECTION_EVIDENCE_LIMIT_LINES = [
  '相册能帮你对照单据、照片与维修流程是否说得通，也能提高门店作假留痕的成本；但即便各项核对一致，也不能保证维修一定没有造假（例如未拍照环节、旧件事后替换、账外施工等相册无法覆盖的情形）。',
  '若要尽可能接近全程可信，通常只有两种方式：全程在场见证施工，或事后委托有资质的第三方鉴定。事故维修如有怀疑，可向承保保险公司申请复检，或反映定损与施工不符之处。',
]

/** AI 分析页头部唯一警示 · 真源 compliance-copy.js · aiInspection */
const { COMPLIANCE_COPY } = require('./compliance-copy')
const AI_INSPECTION_PAGE_NOTICE = COMPLIANCE_COPY.aiInspection

const AI_INSPECTION_CONSENT =
  '将使用本相册的结构化信息与部分照片说明生成 AI 检查建议。若开启图像识别，可能将照片发送至 AI 服务商分析（不用于用户画像）。平台不负责鉴定配件真伪。是否继续？'

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
  MERCHANT_EXTRA_PART_SOP_STAGE3_HINT,
  MERCHANT_EXTRA_PART_SOP_STAGE4_HINT,
  MERCHANT_EXTRA_PART_SOP_LINK,
  MERCHANT_EXTRA_PART_SOP_MODAL_TITLE,
  MERCHANT_EXTRA_PART_SOP_MODAL_CONTENT,
  WARRANTY_DOCUMENT_ID,
  WARRANTY_FIELD_MAX_LEN,
  MERCHANT_WARRANTY_INTRO,
  MERCHANT_WARRANTY_DURATION_LABEL,
  MERCHANT_WARRANTY_DURATION_PLACEHOLDER,
  MERCHANT_WARRANTY_SCOPE_LABEL,
  MERCHANT_WARRANTY_SCOPE_PLACEHOLDER,
  MERCHANT_WARRANTY_NOTE_LABEL,
  MERCHANT_WARRANTY_NOTE_PLACEHOLDER,
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
  AI_INSPECTION_PAGE_NOTICE,
  AI_INSPECTION_CONSENT,
  templateMatches,
  resolveDocumentTypesForTemplate,
  resolveProcessChecklist,
  bumpStrengthForAccident,
  resolveOwnerImportance,
  resolveMerchantEvidenceLabel,
  resolveImportanceLabel,
}
