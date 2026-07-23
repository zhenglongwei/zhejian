const { SERVICE_ALBUM_STAGES, getStageMeta } = require('../../../../constants/service-album-stages')
const { applyTemplateStageMeta } = require('../../../../constants/service-album-template-stage-meta')
const {
  SERVICE_ALBUM_STATUS,
} = require('../../../../constants/service-album-status')
const { PART_TYPE, PART_TYPE_VARIANT } = require('../../../../constants/part-type')
const { PRICE_MODE } = require('../../../../constants/price-mode')
const {
  resolvePlanAmount,
  normalizePlanAmountPayload,
} = require('../../../../utils/album-price')
const {
  fetchMerchantServiceAlbum,
  saveMerchantServiceAlbum,
  completeMerchantServiceAlbum,
  switchMerchantServiceAlbumTemplate,
} = require('../../../../services/merchant-service-album')
const { fetchServiceAlbumTemplateOptions } = require('../../../../services/service-album-template')
const { resolveTemplateStageTitle } = require('../../../../constants/service-album-node-templates')
const {
  canShareToOwner,
  buildOwnerShareMessage,
} = require('../../../../utils/service-album-share')
const { TOOL_HOME_PATH } = require('../../../../utils/share-store-context')
const { resolveMerchantAlbumDisplayStatus } = require('../../../../utils/service-album-display')
const {
  resolveAlbumHasOwner,
  MERCHANT_ALBUM_INVITE_PAGE,
} = require('../../../../utils/merchant-album-nav')
const { persistAlbumNodeImages, persistLocalImages, normalizeStoredImageUrl, uploadImage } = require('../../../../utils/media-upload')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')
const {
  hydrateEvidenceItems,
  filterEvidenceByStage,
  sanitizeEvidenceItemsPayload,
  mergeEvidenceIntoNodes,
  applyProcessOnlyNodes,
  isOldPartEvidenceItem,
  extractOldPartTraces,
  buildValidPlanPartIdSet,
  mergeEvidenceItemsForSave,
} = require('../../../../utils/album-evidence-items')
const { MERCHANT_OLD_PART_INTRO, MERCHANT_INSPECTION_HINT, MERCHANT_COMPLETE_INSP_TITLE, MERCHANT_COMPLETE_INSP_INTRO, MERCHANT_EXTRA_PART_SOP_STAGE3_HINT, MERCHANT_EXTRA_PART_SOP_STAGE4_HINT, MERCHANT_EXTRA_PART_SOP_LINK, MERCHANT_EXTRA_PART_SOP_MODAL_TITLE, MERCHANT_EXTRA_PART_SOP_MODAL_CONTENT } = require('../../../../constants/album-evidence-guide')
const { ALLOW_TEST_OWNER_PHONE } = require('../../../../services/config')
const {
  resolveComparePairRowsFromNodes,
  applyComparePairRowsToNodes,
  syncBeforeFromAssessmentRows,
  normalizeComparePairRows,
} = require('../../../../utils/album-compare-stage-images')
const {
  buildPartWizardRows,
  mergeWizardRowIntoParts,
  appendManualPartRow,
  appendExtraPart,
  removeWorkspaceRow,
} = require('../../../../utils/album-part-wizard')
const {
  runMerchantPlanQuoteOcr,
  recognizePartLabelOcr,
} = require('../../../../services/merchant-plan-parts')
const { AUTHORIZATION_CONSENT } = require('../../../../constants/compliance-copy')

const MERCHANT_OCR_CONSENT_KEY = 'merchant_document_ocr_consent_v1'
const DOCUMENT_OCR_OPTIONS = [
  { label: '报价单', value: 'repair_quote' },
  { label: '定损单', value: 'loss_assessment' },
  { label: '结算单', value: 'settlement' },
]
const { mapPartCodeCandidatesForPicker } = require('../../../../utils/part-code-candidate-display')
const { promptMerchantAuditSubscribe } = require('../../../../utils/subscribe-message-prompt')
const {
  buildMerchantEditInspectionView,
  collectMissingFromPanels,
} = require('../../../../utils/album-merchant-inspection')
const {
  MERCHANT_PART_TYPE_LOCKED_TIP,
  MERCHANT_PART_TYPE_MANUAL_TIP,
  MERCHANT_PART_TYPE_CHANGE_TITLE,
  MERCHANT_PART_TYPE_CHANGE_CONTENT,
  MERCHANT_PART_VERIFY_GUIDE_TITLE,
  MERCHANT_PART_VERIFY_GUIDE_HINT,
  MERCHANT_PART_VERIFY_GUIDE_PLACEHOLDER,
  MERCHANT_PART_VERIFY_GUIDE_MODE_TEXT_TITLE,
  MERCHANT_PART_VERIFY_GUIDE_MODE_TEXT_DESC,
  MERCHANT_PART_VERIFY_GUIDE_MODE_INFORMED_TITLE,
  MERCHANT_PART_VERIFY_GUIDE_MODE_INFORMED_DESC,
} = require('../../../../constants/part-verify-copy')

const PART_TYPE_LIST = Object.values(PART_TYPE)
const BODY_PAINT_TEMPLATE_ID = 'body_paint'
const ACCIDENT_TEMPLATE_ID = 'accident'
const COMPARE_STAGE_TEMPLATE_IDS = new Set([BODY_PAINT_TEMPLATE_ID, ACCIDENT_TEMPLATE_ID])
const STAGE_COMPARE_ID = 'stage_6'
const STAGE_ASSESSMENT_ID = 'stage_2'
const STAGE_PLAN_ID = 'stage_3'
const STAGE_PARTS_ID = 'stage_4'
const STAGE_PROCESS_ID = 'stage_5'

function buildOldPartPartOptions(planParts = [], parts = []) {
  const { rows } = buildPartWizardRows(planParts, parts)
  const options = [{ planPartId: '', label: '不关联配件' }]
  const seen = new Set([''])
  rows.forEach((row) => {
    const planPartId = String(row.planPartId || '').trim()
    const label = String(row.partName || row.planName || '').trim()
    if (!planPartId || !label || seen.has(planPartId)) return
    seen.add(planPartId)
    options.push({ planPartId, label })
  })
  return options
}

function normalizeOwnerPhone(value) {
  return String(value || '').replace(/\D/g, '')
}

const TEMPLATE_SWITCH_HELP =
  '如自动匹配不准确，可手动切换模板。切换不会删除已上传图片。'

function migrateLegacyBodyPaintNodes(map = {}) {
  if (!map || typeof map !== 'object') return map
  const s4 = { ...(map.stage_4 || map['stage_4'] || {}) }
  const s5 = { ...(map.stage_5 || map['stage_5'] || {}) }
  const s6 = { ...(map.stage_6 || map['stage_6'] || {}) }
  const s4Title = String(s4.title || '')
  const s5Title = String(s5.title || '')
  const legacyProcessOn4 = /施工过程|施工记录/.test(s4Title)
  const legacyCompareOn5 = /前后对比|修复后/.test(s5Title)
  const s4Images = Array.isArray(s4.images) ? s4.images : []
  const s5Images = Array.isArray(s5.images) ? s5.images : []
  const s6Images = Array.isArray(s6.images) ? s6.images : []

  if (legacyProcessOn4 && s4Images.length && !s5Images.length) {
    s5.images = s4Images.slice()
    s4.images = []
  }
  if (legacyCompareOn5 && s5Images.length && !s6Images.length) {
    s6.images = s5Images.slice()
    s5.images = []
  }
  return {
    ...map,
    stage_4: s4,
    stage_5: s5,
    stage_6: s6,
    'stage_4': s4,
    'stage_5': s5,
    'stage_6': s6,
  }
}

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    detail: null,
    statusLabel: '',
    statusVariant: 'info',
    stages: SERVICE_ALBUM_STAGES,
    stageTabs: SERVICE_ALBUM_STAGES.map((s) => ({ key: s.id, label: s.title })),
    stageIndex: 0,
    nodes: [],
    parts: [],
    planAmount: '',
    planAmountHint: '交车时可在此填写本次实际费用，车主在相册中可见。',
    pricePreview: { mode: PRICE_MODE.FIXED, amount: null },
    partTypeList: PART_TYPE_LIST,
    partForm: {
      partName: '',
      partBrand: '',
      partTypeIndex: 0,
      actualPrice: '',
    },
    showPartForm: false,
    saving: false,
    completing: false,
    canShareToOwner: false,
    vehicleBrand: '',
    vehicleSeries: '',
    vehiclePlate: '',
    vehicleVin: '',
    isCompleted: false,
    hasOwner: false,
    publicCaseStatus: 'private',
    showBottomPrimary: false,
    bottomPrimaryText: '',
    ownerPhoneInput: '',
    allowTestOwnerPhone: ALLOW_TEST_OWNER_PHONE,
    uploadPrivacyHint:
      '上传后系统自动区分留档与可公示素材；含车牌/单据整页的图片不会进入公示。',
    planStageUploadHint: '请上传报价单/维修方案等照片（仅留档）；并填写方案金额或项目说明。',
    templateOptions: [],
    templatePickerIndex: 0,
    templateId: '',
    templateName: '',
    canSwitchTemplate: false,
    switching: false,
    comparePairRows: [{ before: '', after: '' }],
    isComparePairStage: false,
    isPartsStage: false,
    isPlanStage: false,
    planParts: [],
    planOcrLoading: false,
    planParseHint: '',
    partWizardRows: [],
    partWizardExtras: [],
    partWizardProgress: '',
    activeWizardIndex: -1,
    partLabelOcrLoading: false,
    partCodePickerVisible: false,
    partCodeCandidates: [],
    partCodePickerRowIndex: -1,
    partCodePickerImageCount: 0,
    merchantPartTypeLockedTip: MERCHANT_PART_TYPE_LOCKED_TIP,
    merchantPartTypeManualTip: MERCHANT_PART_TYPE_MANUAL_TIP,
    partVerifyGuideTitle: MERCHANT_PART_VERIFY_GUIDE_TITLE,
    partVerifyGuideHint: MERCHANT_PART_VERIFY_GUIDE_HINT,
    partVerifyGuidePlaceholder: MERCHANT_PART_VERIFY_GUIDE_PLACEHOLDER,
    partVerifyGuideModeTextTitle: MERCHANT_PART_VERIFY_GUIDE_MODE_TEXT_TITLE,
    partVerifyGuideModeTextDesc: MERCHANT_PART_VERIFY_GUIDE_MODE_TEXT_DESC,
    partVerifyGuideModeInformedTitle: MERCHANT_PART_VERIFY_GUIDE_MODE_INFORMED_TITLE,
    partVerifyGuideModeInformedDesc: MERCHANT_PART_VERIFY_GUIDE_MODE_INFORMED_DESC,
    partVerifyGuideMode: 'text',
    partVerifyGuideText: '',
    partVerifyGuideInformed: false,
    showExtraPartForm: false,
    extraPartForm: {
      partName: '',
      partBrand: '',
      partCode: '',
      partTypeIndex: 0,
      extraReason: '',
    },
    evidenceItems: [],
    stageEvidenceSlots: [],
    showStageEvidenceSlots: false,
    showStageProcessUploader: true,
    oldPartTraces: [],
    oldPartPartOptions: [{ planPartId: '', label: '不关联配件' }],
    showOldPartTraces: false,
    oldPartIntroHint: MERCHANT_OLD_PART_INTRO,
    extraPartSopStage3Hint: MERCHANT_EXTRA_PART_SOP_STAGE3_HINT,
    extraPartSopStage4Hint: MERCHANT_EXTRA_PART_SOP_STAGE4_HINT,
    extraPartSopLink: MERCHANT_EXTRA_PART_SOP_LINK,
    merchantInspHint: MERCHANT_INSPECTION_HINT,
    merchantInspSummary: { done: 0, total: 0, missing: 0 },
    merchantInspPanels: [],
    merchantInspColumnLabel: '规范',
    merchantInspExpanded: false,
    merchantInspMissingItems: [],
    inspScrollIntoView: '',
    inspCompleteModalVisible: false,
    inspCompleteModalTitle: MERCHANT_COMPLETE_INSP_TITLE,
    inspCompleteModalIntro: MERCHANT_COMPLETE_INSP_INTRO,
  },

  onLoad(options) {
    this.albumId = options.albumId || ''
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '服务相册信息缺失' })
      return
    }
    this.initPage()
  },

  noop() {},

  computeMerchantInspectionState() {
    return buildMerchantEditInspectionView({
      detail: this.data.detail,
      templateId: this.data.templateId,
      templateName: this.data.templateName,
      nodes: this.data.nodes,
      evidenceItems: this.data.evidenceItems,
      parts: this.data.parts,
      planParts: this.data.planParts,
      comparePairRows: this.data.comparePairRows,
    })
  },

  refreshMerchantInspection() {
    if (this.data.status !== 'normal' || !this.data.detail) return
    try {
      const view = this.computeMerchantInspectionState()
      const missing = collectMissingFromPanels(view.completeness.panels)
      this.setData({
        merchantInspSummary: view.completeness.summary,
        merchantInspPanels: view.completeness.panels,
        merchantInspColumnLabel: view.importanceColumnLabel,
        merchantInspMissingItems: missing,
      })
    } catch (e) {
      console.warn('[merchant-insp] refresh failed', e)
      this.setData({
        merchantInspSummary: { done: 0, total: 0, missing: 0 },
        merchantInspPanels: [],
        merchantInspMissingItems: [],
      })
    }
  },

  onToggleMerchantInsp() {
    this.setData({ merchantInspExpanded: !this.data.merchantInspExpanded })
  },

  openMerchantInspSection() {
    this.setData({
      merchantInspExpanded: true,
      inspScrollIntoView: 'merchant-insp-section',
    })
    setTimeout(() => {
      if (this.data.inspScrollIntoView) {
        this.setData({ inspScrollIntoView: '' })
      }
    }, 400)
  },

  onCloseInspCompleteModal() {
    this.setData({ inspCompleteModalVisible: false })
  },

  onInspCompleteModalViewChecklist() {
    this.setData({ inspCompleteModalVisible: false })
    this.openMerchantInspSection()
  },

  onInspCompleteModalProceedAnyway() {
    this.setData({ inspCompleteModalVisible: false })
    this.showCompleteConfirmModal()
  },

  showCompleteConfirmModal() {
    wx.showModal({
      title: '标记已完工',
      content:
        '完工后服务相册将保存完整记录。车主可在小程序查看；分享脱敏案例须由车主自行确认。',
      confirmText: '确认完工',
      success: (res) => {
        if (!res.confirm) return
        setTimeout(() => this.submitComplete(), 200)
      },
    })
  },

  async initPage() {
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
      this.setData({ status: 'error', errorMessage: '请先完成商家入驻' })
      return
    }
    let templateOptions = []
    try {
      templateOptions = await fetchServiceAlbumTemplateOptions()
    } catch (e) {
      templateOptions = []
    }
    this.setData({ templateOptions })
    this.loadAlbum()
  },

  syncTemplatePickerIndex(templateId) {
    const { templateOptions } = this.data
    const index = (templateOptions || []).findIndex((item) => item.id === templateId)
    return index >= 0 ? index : 0
  },

  mergeNodes(rawNodes, templateId) {
    const map = {}
    ;(rawNodes || []).forEach((n) => {
      const key = n.id || n.nodeId
      if (key) map[key] = n
    })
    const tplId = String(templateId || '').trim()
    if (tplId === BODY_PAINT_TEMPLATE_ID) {
      Object.assign(map, migrateLegacyBodyPaintNodes(map))
    }
    return SERVICE_ALBUM_STAGES.map((stage) => {
      const node = map[stage.id] || {}
      const meta = getStageMeta(stage.id) || stage
      const mergedMeta = applyTemplateStageMeta(tplId, stage.id, {
        description: node.description || meta.description,
        photoTips: node.photoTips || meta.photoTips,
        compareGuidance: node.compareGuidance || '',
        requiredLevelLabel: node.requiredLevelLabel || meta.requiredLevelLabel,
        requiredLevelVariant: node.requiredLevelVariant || meta.requiredLevelVariant,
      })
      const templateTitle = resolveTemplateStageTitle(tplId, stage.id)
      const title = templateTitle || stage.title
      return {
        id: stage.id,
        title,
        description: mergedMeta.description,
        photoTips: mergedMeta.photoTips,
        compareGuidance: mergedMeta.compareGuidance,
        requiredLevelLabel: mergedMeta.requiredLevelLabel || '',
        requiredLevelVariant: mergedMeta.requiredLevelVariant || 'default',
        comparePairRows: Array.isArray(node.comparePairRows) ? node.comparePairRows : [],
        notePlaceholder: meta.notePlaceholder || stage.notePlaceholder || '补充本节点说明',
        publicUploadHint: mergedMeta.publicUploadHint || '',
        images: (node.images || []).map(normalizeStoredImageUrl).filter(Boolean),
        note: node.note || '',
      }
    })
  },

  buildStageTabs(nodes) {
    return (nodes || []).map((n) => ({ key: n.id, label: n.title }))
  },

  resolveCompareStageIndex() {
    return (this.data.nodes || []).findIndex((n) => n.id === STAGE_COMPARE_ID)
  },

  resolveAssessmentImages() {
    const node = (this.data.nodes || []).find((n) => n.id === STAGE_ASSESSMENT_ID)
    return (node && node.images) || []
  },

  refreshCompareStageFlags(stageIndex = this.data.stageIndex) {
    const stageId = (this.data.stages[stageIndex] && this.data.stages[stageIndex].id) || ''
    const isPartsStage = stageId === STAGE_PARTS_ID
    const isPlanStage = stageId === STAGE_PLAN_ID
    const isComparePairStage =
      COMPARE_STAGE_TEMPLATE_IDS.has(this.data.templateId) && stageId === STAGE_COMPARE_ID
    this.setData({ isComparePairStage, isPartsStage, isPlanStage })
    this.refreshStageEvidenceUI(stageIndex, { isComparePairStage })
    return isComparePairStage
  },

  refreshStageEvidenceUI(stageIndex = this.data.stageIndex, flags = {}) {
    const stageId = (this.data.stages[stageIndex] && this.data.stages[stageIndex].id) || ''
    const stageEvidenceSlots = filterEvidenceByStage(this.data.evidenceItems, stageId)
    const isComparePairStage =
      flags.isComparePairStage != null
        ? flags.isComparePairStage
        : this.data.isComparePairStage
    const showStageEvidenceSlots = stageEvidenceSlots.length > 0
    const showStageProcessUploader =
      !showStageEvidenceSlots ||
      stageId === STAGE_PROCESS_ID ||
      (stageId === STAGE_COMPARE_ID && !isComparePairStage)
    const showOldPartTraces =
      stageId === STAGE_PROCESS_ID && !isComparePairStage && !this.data.isPartsStage
    this.setData({
      stageEvidenceSlots,
      showStageEvidenceSlots,
      showStageProcessUploader,
      showOldPartTraces,
      oldPartPartOptions: buildOldPartPartOptions(this.data.planParts, this.data.parts),
    })
  },

  initComparePairRowsFromNodes(nodes, templateId) {
    if (!COMPARE_STAGE_TEMPLATE_IDS.has(templateId)) {
      return [{ before: '', after: '' }]
    }
    const rows = resolveComparePairRowsFromNodes(nodes)
    return rows.length ? rows : [{ before: '', after: '' }]
  },

  applyComparePairRowsToPage(pairRows) {
    const rows = normalizeComparePairRows(pairRows)
    const nodes = applyComparePairRowsToNodes(this.data.nodes, rows)
    this.setData({ comparePairRows: rows.length ? rows : [{ before: '', after: '' }], nodes }, () => {
      this.refreshMerchantInspection()
    })
  },

  redirectToInviteIfNoOwner(detail) {
    if (resolveAlbumHasOwner(detail || {})) return
    wx.redirectTo({
      url: `${MERCHANT_ALBUM_INVITE_PAGE}?albumId=${encodeURIComponent(this.albumId)}`,
    })
  },

  requireOwnerLinked(actionLabel) {
    if (this.data.hasOwner || this.data.allowTestOwnerPhone) return true
    wx.showModal({
      title: '请先请车主扫码',
      content: `${actionLabel || '上传过程图'}前，须车主扫码并确认隐私说明。`,
      confirmText: '去扫码页',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) this.onInviteOwnerScan()
      },
    })
    return false
  },

  applyAlbum(detail) {
    let mergedNodes = this.mergeNodes(detail.nodes, detail.templateId)
    const coach = detail.albumCoach
    if (coach && coach.stages) {
      mergedNodes = mergedNodes.map((n) => {
        const stageCoach = coach.stages[n.id]
        if (!stageCoach) return n
        const prefer = (stageCoach.shoot_prefer || [])
          .map((x) => x.title)
          .filter(Boolean)
          .join('；')
        const avoid = (stageCoach.shoot_avoid || [])
          .slice(0, 4)
          .map((x) => x.title)
          .filter(Boolean)
          .join('、')
        const noteHint = stageCoach.note_hints && stageCoach.note_hints[0]
        const hintParts = [
          n.publicUploadHint,
          prefer ? `建议拍：${prefer}` : '',
          avoid ? `尽量别拍：${avoid}` : '',
        ].filter(Boolean)
        return {
          ...n,
          publicUploadHint: hintParts.join('。'),
          notePlaceholder: noteHint
            ? `${noteHint.example || ''}（${(noteHint.bullets || []).join(' / ')}）`
            : n.notePlaceholder,
        }
      })
    }
    const evidenceItems = hydrateEvidenceItems({
      templateId: detail.templateId,
      savedItems: detail.evidenceItems || [],
      nodes: mergedNodes,
    })
    const nodes = applyProcessOnlyNodes(mergedNodes, evidenceItems)
    const stageTabs = this.buildStageTabs(nodes)
    const planAmount = resolvePlanAmount(detail)
    const canShare = canShareToOwner(detail)
    const isCompleted =
      detail.status === SERVICE_ALBUM_STATUS.COMPLETED ||
      detail.status === SERVICE_ALBUM_STATUS.PUBLISHED
    const display = resolveMerchantAlbumDisplayStatus(detail.status)
    const hasOwnerPhone = Boolean(String(detail.userPhone || '').trim())
    const hasOwner = Boolean(detail.hasOwner) || hasOwnerPhone
    const publicCaseStatus = detail.publicCaseStatus || 'private'
    const canSwitchTemplate =
      !isCompleted && publicCaseStatus === 'private' && detail.status !== 'pending_review'
    let showBottomPrimary = false
    let bottomPrimaryText = ''
    if (
      detail.status !== SERVICE_ALBUM_STATUS.COMPLETED &&
      detail.status !== SERVICE_ALBUM_STATUS.PUBLISHED
    ) {
      showBottomPrimary = true
      bottomPrimaryText = '标记已完工'
    }
    const comparePairRows = this.initComparePairRowsFromNodes(nodes, detail.templateId || '')
    this.setData({
      status: 'normal',
      detail,
      statusLabel: display.statusLabel,
      statusVariant: display.statusVariant,
      stageTabs,
      nodes,
      comparePairRows,
      parts: (detail.parts || []).map((p) => ({
        ...p,
        typeVariant: PART_TYPE_VARIANT[p.partType] || 'default',
      })),
      planAmount: planAmount != null ? String(planAmount) : '',
      pricePreview: {
        mode: PRICE_MODE.FIXED,
        amount: planAmount,
      },
      canShareToOwner: canShare,
      vehicleBrand: (detail.vehicle && detail.vehicle.brand) || '',
      vehicleSeries: (detail.vehicle && detail.vehicle.series) || '',
      vehiclePlate: (detail.vehicle && (detail.vehicle.plate || detail.vehicle.plateDisplay)) || '',
      vehicleVin: (detail.vehicle && detail.vehicle.vin) || '',
      isCompleted,
      hasOwner,
      publicCaseStatus,
      showContentOptimizeEntry: isCompleted && !detail.isAuthorized,
      showBottomPrimary,
      bottomPrimaryText,
      templateId: detail.templateId || '',
      templateName: detail.templateName || '',
      templatePickerIndex: this.syncTemplatePickerIndex(detail.templateId),
      canSwitchTemplate,
      planParts: detail.planParts || [],
      partVerifyGuideText: detail.partVerifyGuideText || '',
      partVerifyGuideInformed: Boolean(detail.partVerifyGuideInformed),
      partVerifyGuideMode: detail.partVerifyGuideInformed ? 'informed' : 'text',
      ownerPhoneInput: hasOwnerPhone ? '' : this.data.ownerPhoneInput,
      evidenceItems,
      oldPartTraces: extractOldPartTraces(evidenceItems),
    }, () => {
      this.refreshCompareStageFlags(this.data.stageIndex)
      this.refreshPartWizard()
      this.refreshMerchantInspection()
      this.redirectToInviteIfNoOwner(detail)
    })
    this.syncShareMenu(canShare)
  },

  syncShareMenu(enabled) {
    if (enabled) {
      wx.showShareMenu({ withShareTicket: false, menus: ['shareAppMessage'] })
    } else {
      wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    }
  },

  async loadAlbum(options = {}) {
    const silent = Boolean(options.silent)
    if (!silent) {
      this.setData({ status: 'loading', errorMessage: '' })
    }
    try {
      const detail = await fetchMerchantServiceAlbum(this.albumId)
      this.applyAlbum(detail)
    } catch (e) {
      if (!silent) {
        this.setData({
          status: 'error',
          errorMessage: (e && e.message) || '加载失败',
        })
      }
    }
  },

  onRetry() {
    this.loadAlbum()
  },

  onStageTabChange(e) {
    const { key } = e.detail
    const index = SERVICE_ALBUM_STAGES.findIndex((s) => s.id === key)
    if (index >= 0) {
      this.setData({ stageIndex: index }, () => {
        const isCompare = this.refreshCompareStageFlags(index)
        if (isCompare) {
          const rows = this.initComparePairRowsFromNodes(this.data.nodes, this.data.templateId)
          this.setData({ comparePairRows: rows })
        }
      })
    }
  },

  onCompareRowsChange(e) {
    const pairRows = (e.detail && e.detail.pairRows) || []
    this.applyComparePairRowsToPage(pairRows)
  },

  onCompareNoteChange(e) {
    const value = (e.detail && e.detail.value) || ''
    const nodes = this.data.nodes.slice()
    const idx = this.resolveCompareStageIndex()
    if (idx < 0) return
    nodes[idx] = { ...nodes[idx], note: value }
    this.setData({ nodes })
  },

  onSyncCompareFromAssessment() {
    const assessment = this.resolveAssessmentImages()
    if (!assessment.length) {
      wx.showToast({ title: '请先在「损伤评估」上传近景', icon: 'none' })
      return
    }
    const rows = syncBeforeFromAssessmentRows(this.data.comparePairRows, assessment)
    this.applyComparePairRowsToPage(rows)
    wx.showToast({ title: '已同步维修前照片', icon: 'success' })
  },

  onTemplateSwitchHelp() {
    wx.showModal({
      title: '切换模板',
      content: TEMPLATE_SWITCH_HELP,
      showCancel: false,
      confirmText: '知道了',
    })
  },

  onExtraPartSopHelp() {
    wx.showModal({
      title: MERCHANT_EXTRA_PART_SOP_MODAL_TITLE,
      content: MERCHANT_EXTRA_PART_SOP_MODAL_CONTENT,
      showCancel: false,
      confirmText: '知道了',
    })
  },

  onTemplateChange(e) {
    const index = Number(e.detail.value)
    const { templateOptions, templateId, canSwitchTemplate } = this.data
    if (!canSwitchTemplate || !Number.isFinite(index)) return
    const picked = templateOptions[index]
    if (!picked || picked.id === templateId) return

    wx.showModal({
      title: '切换相册模板',
      content: `将切换为「${picked.name}」模板。已上传图片会保留在同阶段节点上，完整度将重新计算。`,
      confirmText: '确认切换',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) {
          this.setData({
            templatePickerIndex: this.syncTemplatePickerIndex(this.data.templateId),
          })
          return
        }
        this.doSwitchTemplate(picked.id, index)
      },
    })
  },

  async doSwitchTemplate(templateId, pickerIndex) {
    if (this.data.switching) return
    this.setData({ switching: true })
    try {
      wx.showLoading({ title: '切换中', mask: true })
      const detail = await switchMerchantServiceAlbumTemplate(this.albumId, templateId)
      wx.hideLoading()
      this.applyAlbum(detail)
      this.setData({ templatePickerIndex: pickerIndex, stageIndex: 0 })
      wx.showToast({ title: '已切换模板', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      this.setData({
        templatePickerIndex: this.syncTemplatePickerIndex(this.data.templateId),
      })
      wx.showToast({ title: (e && e.message) || '切换失败', icon: 'none' })
    } finally {
      this.setData({ switching: false })
    }
  },

  onEvidenceSlotsChange(e) {
    const items = (e.detail && e.detail.items) || []
    const stageId =
      (this.data.stages[this.data.stageIndex] && this.data.stages[this.data.stageIndex].id) || ''
    const otherItems = (this.data.evidenceItems || []).filter(
      (item) =>
        item &&
        (item.stageId !== stageId || isOldPartEvidenceItem(item)),
    )
    const stageItems = items.map((item) => ({ ...item, stageId: item.stageId || stageId }))
    const evidenceItems = [...otherItems, ...stageItems]
    this.setData({ evidenceItems }, () => {
      this.refreshStageEvidenceUI(this.data.stageIndex)
      this.refreshMerchantInspection()
    })
  },

  onOldPartTracesChange(e) {
    const traces = (e.detail && e.detail.traces) || []
    const documentItems = (this.data.evidenceItems || []).filter(
      (item) => !isOldPartEvidenceItem(item),
    )
    const validPlanPartIds = buildValidPlanPartIdSet(this.data.planParts, this.data.parts)
    const evidenceItems = mergeEvidenceItemsForSave(documentItems, traces, validPlanPartIds)
    this.setData({ oldPartTraces: traces, evidenceItems }, () => {
      this.refreshMerchantInspection()
    })
  },

  async persistEvidenceItemImages(items) {
    let droppedStaleCount = 0
    const next = []
    for (const item of items || []) {
      const persisted = await persistLocalImages(item.images || [])
      droppedStaleCount += persisted.droppedStaleCount || 0
      next.push({ ...item, images: persisted.images })
    }
    return { items: next, droppedStaleCount }
  },

  onNodeImages(e) {
    let index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) {
      index = this.data.stageIndex
    }
    if (!Number.isFinite(index)) return
    const nodes = this.data.nodes.slice()
    nodes[index].images = (e.detail && e.detail.images) || []
    const updates = { nodes }

    if (
      COMPARE_STAGE_TEMPLATE_IDS.has(this.data.templateId) &&
      nodes[index].id === STAGE_ASSESSMENT_ID
    ) {
      const assessment = nodes[index].images || []
      const rows = syncBeforeFromAssessmentRows(this.data.comparePairRows, assessment)
      updates.comparePairRows = rows.length ? rows : [{ before: '', after: '' }]
      updates.nodes = applyComparePairRowsToNodes(nodes, rows)
    }

    this.setData(updates, () => {
      this.refreshMerchantInspection()
    })
  },

  onNodeNoteChange(e) {
    let index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) {
      index = this.data.stageIndex
    }
    const nodes = this.data.nodes.slice()
    nodes[index].note = (e.detail && e.detail.value) || ''
    this.setData({ nodes })
  },

  onOwnerPhoneInput(e) {
    this.setData({ ownerPhoneInput: e.detail.value })
  },

  validateOwnerPhoneInput() {
    const phone = normalizeOwnerPhone(this.data.ownerPhoneInput)
    if (!phone) return { ok: true, phone: '' }
    if (phone.length !== 11) {
      return { ok: false, message: '请填写正确的手机号' }
    }
    return { ok: true, phone }
  },

  onVehicleInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [field]: e.detail.value })
  },

  validateVehicle() {
    const brand = (this.data.vehicleBrand || '').trim()
    const series = (this.data.vehicleSeries || '').trim()
    if (!brand) {
      wx.showToast({ title: '请填写车辆品牌', icon: 'none' })
      return false
    }
    if (!series) {
      wx.showToast({ title: '请填写车系', icon: 'none' })
      return false
    }
    return true
  },

  buildVehiclePayload() {
    const existing = (this.data.detail && this.data.detail.vehicle) || {}
    const payload = {
      brand: (this.data.vehicleBrand || '').trim(),
      series: (this.data.vehicleSeries || '').trim(),
    }
    const plate = String(existing.plate || existing.plateDisplay || this.data.vehiclePlate || '')
      .trim()
      .replace(/[\s·.]/g, '')
      .toUpperCase()
    const vin = String(existing.vin || this.data.vehicleVin || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
    if (plate) payload.plate = plate
    if (vin) payload.vin = vin
    return payload
  },

  isTempImagePath(url) {
    const value = String(url || '')
    return (
      value.startsWith('wxfile://') ||
      value.startsWith('http://tmp/') ||
      value.startsWith('https://tmp/') ||
      value.includes('__tmp__')
    )
  },

  async ensureWizardRowPhotosUploaded(rowIndex) {
    const row = (this.data.partWizardRows || [])[rowIndex]
    if (!row) return []
    const photos = Array.isArray(row.photos) ? row.photos.slice() : []
    let changed = false
    for (let i = 0; i < photos.length; i += 1) {
      if (!this.isTempImagePath(photos[i])) continue
      photos[i] = await uploadImage(photos[i])
      changed = true
    }
    if (changed) {
      this.setData({ [`partWizardRows[${rowIndex}].photos`]: photos })
    }
    return photos
  },

  applyPartCodeCandidate(rowIndex, candidate = {}) {
    const code = String(candidate.partCode || '').trim()
    if (rowIndex < 0 || !code) return
    const row = (this.data.partWizardRows || [])[rowIndex] || {}
    const patch = {
      [`partWizardRows[${rowIndex}].partCode`]: code,
      [`partWizardRows[${rowIndex}].partCodeFromOcr`]: true,
      [`partWizardRows[${rowIndex}].ocrRevision`]: Number(row.ocrRevision || 0) + 1,
    }
    const brand = String(candidate.partBrand || '').trim()
    if (brand) {
      patch[`partWizardRows[${rowIndex}].partBrand`] = brand
    }
    this.setData(patch)
  },

  openPartCodePicker(rowIndex, candidates = [], imageCount = 0) {
    this.setData({
      partCodePickerVisible: true,
      partCodePickerRowIndex: rowIndex,
      partCodeCandidates: mapPartCodeCandidatesForPicker(candidates),
      partCodePickerImageCount: imageCount,
    })
  },

  onClosePartCodePicker() {
    this.setData({
      partCodePickerVisible: false,
      partCodeCandidates: [],
      partCodePickerRowIndex: -1,
      partCodePickerImageCount: 0,
    })
  },

  onPickPartCodeCandidate(e) {
    const pickIndex = Number(e.currentTarget.dataset.index)
    const rowIndex = this.data.partCodePickerRowIndex
    const candidate = (this.data.partCodeCandidates || [])[pickIndex]
    if (!candidate || rowIndex < 0) return
    this.onClosePartCodePicker()
    this.applyPartCodeCandidate(rowIndex, candidate)
    wx.showToast({ title: '已识别，请核对', icon: 'none' })
  },

  refreshPartWizard() {
    const wizard = buildPartWizardRows(this.data.planParts, this.data.parts)
    this.setData({
      partWizardRows: wizard.rows,
      partWizardExtras: wizard.extras,
      partWizardProgress: wizard.progressLabel,
      oldPartPartOptions: buildOldPartPartOptions(this.data.planParts, this.data.parts),
    }, () => {
      this.refreshMerchantInspection()
    })
  },

  mapPartsWithVariants(parts = []) {
    return (parts || []).map((p) => ({
      ...p,
      typeVariant: PART_TYPE_VARIANT[p.partType] || 'default',
    }))
  },

  async persistPartsCatalog(parts, planParts) {
    const nextParts = this.mapPartsWithVariants(parts || this.data.parts)
    const nextPlanParts = planParts != null ? planParts : this.data.planParts
    const { payload, droppedStaleCount } = await this.buildSavePayload({
      parts: nextParts,
      planParts: nextPlanParts,
    })
    const detail = await saveMerchantServiceAlbum(this.albumId, payload)
    this.applyAlbum(detail)
    if (droppedStaleCount) this.notifyStaleImagesDropped(droppedStaleCount)
  },

  syncPlanPartsFromWizardRow(row = {}) {
    const planPartId = String(row.planPartId || '').trim()
    if (!planPartId) return this.data.planParts
    return (this.data.planParts || []).map((plan) => {
      if (String(plan.planPartId || '') !== planPartId) return plan
      return {
        ...plan,
        name: String(row.partName || row.planName || plan.name || '').trim(),
        partType: row.typeLocked && row.planType ? row.planType : row.partType || plan.partType,
        partBrand: String(row.partBrand || plan.partBrand || '').trim(),
        partCode: String(row.partCode || plan.partCode || '').trim(),
        qty: row.qty || plan.qty || 1,
      }
    })
  },

  resolveStage3QuoteImage() {
    const node = (this.data.nodes || []).find((item) => item.id === STAGE_PLAN_ID)
    const images = (node && node.images) || []
    for (let i = images.length - 1; i >= 0; i -= 1) {
      const url = normalizeStoredImageUrl(images[i])
      if (url) return url
    }
    return ''
  },

  onAddPartRow() {
    const { planParts, parts } = appendManualPartRow(this.data.planParts, this.data.parts, {
      partName: `配件 ${(this.data.partWizardRows || []).length + 1}`,
    })
    const mapped = this.mapPartsWithVariants(parts)
    this.setData(
      {
        planParts,
        parts: mapped,
        activeWizardIndex: planParts.length - 1,
      },
      () => this.refreshPartWizard(),
    )
  },

  onAddPartByPhotos() {
    if (this.data.saving || this.data.completing || this.data.switching) return
    wx.chooseMedia({
      count: 3,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const paths = (res.tempFiles || []).map((f) => f.tempFilePath).filter(Boolean)
        if (!paths.length) return
        const { planParts, parts } = appendManualPartRow(this.data.planParts, this.data.parts, {
          partName: `配件 ${(this.data.partWizardRows || []).length + 1}`,
          photos: paths,
        })
        const mapped = this.mapPartsWithVariants(parts)
        this.setData(
          {
            planParts,
            parts: mapped,
            activeWizardIndex: planParts.length - 1,
          },
          () => this.refreshPartWizard(),
        )
      },
    })
  },

  async onRemovePartRow(e) {
    const index = Number(e.currentTarget.dataset.index)
    const row = this.data.partWizardRows[index]
    if (!row) return
    const { planParts, parts } = removeWorkspaceRow(
      this.data.parts,
      this.data.planParts,
      row,
    )
    const mapped = this.mapPartsWithVariants(parts)
    this.setData(
      {
        planParts,
        parts: mapped,
        activeWizardIndex: -1,
      },
      () => this.refreshPartWizard(),
    )
    try {
      wx.showLoading({ title: '保存中', mask: true })
      await this.persistPartsCatalog(mapped, planParts)
      wx.hideLoading()
      wx.showToast({ title: '已删除', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' })
    }
  },

  async onRunPlanQuoteOcr() {
    if (this.data.planOcrLoading) return
    const consented = await this.ensureDocumentOcrConsent()
    if (!consented) return

    const documentType = await this.pickDocumentOcrType()
    if (!documentType) return

    let imageUrl = this.resolveStage3QuoteImage()
    if (!imageUrl && documentType === 'repair_quote') {
      wx.showToast({ title: '请先在维修方案节点上传报价单图片', icon: 'none' })
      return
    }
    if (!imageUrl) {
      imageUrl = this.resolveLatestStageImage(
        documentType === 'settlement' ? 'stage_6' : 'stage_3',
      )
    }
    if (!imageUrl) {
      wx.showToast({
        title:
          documentType === 'settlement'
            ? '请先上传结算单图片'
            : documentType === 'loss_assessment'
              ? '请先上传定损单图片'
              : '请先上传单据图片',
        icon: 'none',
      })
      return
    }

    this.setData({ planOcrLoading: true })
    wx.showLoading({ title: '识别中', mask: true })
    try {
      if (this.isTempImagePath(imageUrl)) {
        imageUrl = await uploadImage(imageUrl)
      }
      const result = await runMerchantPlanQuoteOcr(this.albumId, {
        imageUrl,
        documentType,
      })
      if (documentType === 'repair_quote') {
        const parts = this.mapPartsWithVariants(result.parts || [])
        this.setData(
          {
            planParts: result.planParts || [],
            parts,
            planParseHint: result.parseHint || '',
            activeWizardIndex: parts.length ? 0 : -1,
          },
          () => this.refreshPartWizard(),
        )
        wx.showToast({ title: '已辅助填入配件清单，请核对', icon: 'none' })
      } else {
        this.setData({ planParseHint: result.parseHint || '' })
        const preview = String(result.textPreview || '').slice(0, 500)
        const amounts = (result.amountCandidates || []).map((n) => `¥${n}`).join('、')
        wx.showModal({
          title: documentType === 'settlement' ? '结算单识别结果' : '定损单识别结果',
          content:
            (amounts ? `金额候选：${amounts}\n\n` : '') +
            (preview || '已写入节点 OCR 摘要，请打开对应阶段核对说明文字。'),
          showCancel: false,
          confirmText: '知道了',
        })
        try {
          const detail = await fetchMerchantServiceAlbum(this.albumId)
          if (detail && detail.nodes) {
            this.setData({ nodes: detail.nodes })
          }
        } catch (_) {
          /* ignore refresh errors */
        }
      }
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '识别失败，可手工添加', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ planOcrLoading: false })
    }
  },

  ensureDocumentOcrConsent() {
    return new Promise((resolve) => {
      try {
        if (wx.getStorageSync(MERCHANT_OCR_CONSENT_KEY) === '1') {
          resolve(true)
          return
        }
      } catch (_) {
        /* continue */
      }
      const text =
        (AUTHORIZATION_CONSENT.merchant_document_ocr &&
          AUTHORIZATION_CONSENT.merchant_document_ocr.text) ||
        '将把单据图提交阿里云 OCR 识别，仅用于辅助填表；原图不进入公开页。'
      wx.showModal({
        title: '单据 OCR 说明',
        content: text,
        confirmText: '同意并识别',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            try {
              wx.setStorageSync(MERCHANT_OCR_CONSENT_KEY, '1')
            } catch (_) {
              /* ignore */
            }
            resolve(true)
          } else {
            resolve(false)
          }
        },
        fail: () => resolve(false),
      })
    })
  },

  pickDocumentOcrType() {
    return new Promise((resolve) => {
      wx.showActionSheet({
        itemList: DOCUMENT_OCR_OPTIONS.map((item) => item.label),
        success: (res) => {
          const opt = DOCUMENT_OCR_OPTIONS[res.tapIndex]
          resolve(opt ? opt.value : '')
        },
        fail: () => resolve(''),
      })
    })
  },

  resolveLatestStageImage(stageId) {
    const nodes = this.data.nodes || []
    const node = nodes.find((item) => item.nodeId === stageId || item.id === stageId)
    const images = (node && (node.images || node.media)) || []
    for (let i = images.length - 1; i >= 0; i -= 1) {
      const url = images[i] && (images[i].url || images[i].src || images[i])
      if (url) return url
    }
    return this.resolveStage3QuoteImage()
  },

  onToggleWizardRow(e) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({
      activeWizardIndex: this.data.activeWizardIndex === index ? -1 : index,
    })
  },

  onWizardInput(e) {
    const { index, field } = e.currentTarget.dataset
    this.setData({ [`partWizardRows[${index}].${field}`]: e.detail.value })
  },

  onWizardTypeChange(e) {
    const index = Number(e.currentTarget.dataset.index)
    const row = (this.data.partWizardRows || [])[index]
    if (row && row.typeLocked) {
      this.showPartTypeChangeBlockedModal()
      return
    }
    const partType = PART_TYPE_LIST[Number(e.detail.value)] || ''
    this.setData({
      [`partWizardRows[${index}].partType`]: partType,
      [`partWizardRows[${index}].partTypeIndex`]: Number(e.detail.value),
    })
  },

  onLockedPartTypeTap() {
    this.showPartTypeChangeBlockedModal()
  },

  showPartTypeChangeBlockedModal() {
    wx.showModal({
      title: MERCHANT_PART_TYPE_CHANGE_TITLE,
      content: MERCHANT_PART_TYPE_CHANGE_CONTENT,
      showCancel: false,
      confirmText: '知道了',
    })
  },

  onPartVerifyGuideInput(e) {
    this.setData({ partVerifyGuideText: e.detail.value || '' })
  },

  onPartVerifyGuideModeTap(e) {
    const mode = String((e.currentTarget.dataset && e.currentTarget.dataset.mode) || '')
    if (mode !== 'text' && mode !== 'informed') return
    this.setData({
      partVerifyGuideMode: mode,
      partVerifyGuideInformed: mode === 'informed',
      ...(mode === 'informed' ? { partVerifyGuideText: '' } : {}),
    })
  },

  togglePartVerifyGuideInformed() {
    this.onPartVerifyGuideModeTap({
      currentTarget: {
        dataset: {
          mode: this.data.partVerifyGuideMode === 'informed' ? 'text' : 'informed',
        },
      },
    })
  },

  onWizardPhotosChange(e) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({
      [`partWizardRows[${index}].photos`]: (e.detail && e.detail.images) || [],
    })
  },

  async onRunPartLabelOcr(e) {
    const index = Number(e.currentTarget.dataset.index)
    const row = this.data.partWizardRows[index]
    if (!row || this.data.partLabelOcrLoading) return
    const photos = (row.photos || []).filter(Boolean)
    if (!photos.length) {
      wx.showToast({ title: '请先上传凭证图', icon: 'none' })
      return
    }
    this.setData({ partLabelOcrLoading: true })
    wx.showLoading({ title: '识别中', mask: true })
    try {
      const imageUrls = await this.ensureWizardRowPhotosUploaded(index)
      const result = await recognizePartLabelOcr(this.albumId, { imageUrls })
      const candidates = result.candidates || []
      wx.hideLoading()
      if (!candidates.length) {
        const failedCount = (result.failures || []).length
        wx.showToast({
          title: failedCount
            ? '未识别到编码，请换图或手工填写'
            : '未识别到疑似编码',
          icon: 'none',
        })
        return
      }
      if (candidates.length === 1) {
        this.applyPartCodeCandidate(index, candidates[0])
        wx.showToast({ title: '已识别，请核对', icon: 'none' })
        return
      }
      this.openPartCodePicker(index, candidates, result.imageCount || imageUrls.length)
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: (err && err.message) || '识别失败', icon: 'none' })
    } finally {
      this.setData({ partLabelOcrLoading: false })
    }
  },

  async onSaveWizardRow(e) {
    const index = Number(e.currentTarget.dataset.index)
    const row = this.data.partWizardRows[index]
    if (!row) return
    if (!(row.photos && row.photos.length)) {
      wx.showToast({ title: '请至少上传一张凭证图', icon: 'none' })
      return
    }
    if (!String(row.partName || row.planName || '').trim()) {
      wx.showToast({ title: '请填写配件名称', icon: 'none' })
      return
    }
    if (!String(row.partType || '').trim()) {
      wx.showToast({ title: '请选择配件类型', icon: 'none' })
      return
    }
    let photos = row.photos || []
    const uploaded = await persistLocalImages(photos)
    photos = uploaded.images
    const mergedRow = { ...row, photos }
    if (row.typeLocked && row.planType) {
      mergedRow.partType = row.planType
    }
    if (row.partCodeFromOcr || row.ocrRevision) {
      mergedRow.ocrRevision = row.ocrRevision || 1
      mergedRow.confirmedAt = new Date().toISOString()
    }
    const planParts = this.syncPlanPartsFromWizardRow(mergedRow)
    const parts = this.mapPartsWithVariants(
      mergeWizardRowIntoParts(this.data.parts, mergedRow),
    )
    this.setData({ parts, planParts }, () => this.refreshPartWizard())
    try {
      wx.showLoading({ title: '保存中', mask: true })
      await this.persistPartsCatalog(parts, planParts)
      wx.hideLoading()
      wx.showToast({ title: '已保存本项', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
    }
  },

  onOpenExtraPartForm() {
    this.setData({ showExtraPartForm: true })
  },

  onCancelExtraPartForm() {
    this.setData({
      showExtraPartForm: false,
      extraPartForm: {
        partName: '',
        partBrand: '',
        partCode: '',
        partTypeIndex: 0,
        extraReason: '',
      },
    })
  },

  onExtraPartInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [`extraPartForm.${field}`]: e.detail.value })
  },

  onExtraPartTypeChange(e) {
    this.setData({ 'extraPartForm.partTypeIndex': Number(e.detail.value) })
  },

  onAddExtraPart() {
    const form = this.data.extraPartForm
    const name = String(form.partName || '').trim()
    if (!name) {
      wx.showToast({ title: '请填写增项名称', icon: 'none' })
      return
    }
    const partType = PART_TYPE_LIST[form.partTypeIndex] || PART_TYPE.AFTERMARKET
    const parts = appendExtraPart(this.data.parts, {
      partName: name,
      partBrand: form.partBrand,
      partCode: form.partCode,
      partType,
      extraReason: form.extraReason,
      photos: [],
    }).map((p) => ({
      ...p,
      typeVariant: PART_TYPE_VARIANT[p.partType] || 'default',
    }))
    this.setData({ parts, showExtraPartForm: false, extraPartForm: {
      partName: '',
      partBrand: '',
      partCode: '',
      partTypeIndex: 0,
      extraReason: '',
    }}, () => this.refreshPartWizard())
    wx.showToast({ title: '增项已添加', icon: 'success' })
  },

  onPlanInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [field]: e.detail.value }, () => this.syncPricePreview())
  },

  syncPricePreview() {
    const amount = parseInt(this.data.planAmount, 10)
    this.setData({
      pricePreview: {
        mode: PRICE_MODE.FIXED,
        amount: Number.isFinite(amount) && amount > 0 ? amount : null,
      },
    })
  },

  onPartInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [`partForm.${field}`]: e.detail.value })
  },

  onPartTypeChange(e) {
    this.setData({ 'partForm.partTypeIndex': Number(e.detail.value) })
  },

  onOpenPartForm() {
    this.setData({ showPartForm: true }, () => {
      wx.pageScrollTo({ selector: '#part-form', duration: 200 })
    })
  },

  onCancelPartForm() {
    this.setData({
      showPartForm: false,
      partForm: {
        partName: '',
        partBrand: '',
        partTypeIndex: 0,
        actualPrice: '',
      },
    })
  },

  onAddPart() {
    const { partForm, parts } = this.data
    const name = (partForm.partName || '').trim()
    if (!name) {
      wx.showToast({ title: '请填写配件名称', icon: 'none' })
      return
    }
    const partType = PART_TYPE_LIST[partForm.partTypeIndex] || PART_TYPE.OEM
    const price = parseInt(partForm.actualPrice, 10)
    const next = parts.concat([
      {
        partId: `part_${Date.now()}`,
        partName: name,
        partBrand: (partForm.partBrand || '').trim(),
        partType,
        actualPrice: Number.isFinite(price) ? price : undefined,
        typeVariant: PART_TYPE_VARIANT[partType] || 'default',
      },
    ])
    this.setData({
      parts: next,
      showPartForm: false,
      partForm: { partName: '', partBrand: '', partTypeIndex: 0, actualPrice: '' },
    })
    wx.showToast({ title: '配件已添加', icon: 'success' })
  },

  async buildSavePayload(overrides = {}) {
    let nodesSource = this.data.nodes
    if (COMPARE_STAGE_TEMPLATE_IDS.has(this.data.templateId)) {
      const rows = normalizeComparePairRows(this.data.comparePairRows)
      if (rows.length) {
        nodesSource = applyComparePairRowsToNodes(nodesSource, rows)
      }
    }
    const validPlanPartIds = buildValidPlanPartIdSet(this.data.planParts, this.data.parts)
    const documentEvidence = (this.data.evidenceItems || []).filter(
      (item) => !isOldPartEvidenceItem(item),
    )
    const mergedEvidence = mergeEvidenceItemsForSave(
      documentEvidence,
      this.data.oldPartTraces,
      validPlanPartIds,
    )
    const { items: evidenceItems, droppedStaleCount: evidenceDropped } =
      await this.persistEvidenceItemImages(mergedEvidence)
    nodesSource = mergeEvidenceIntoNodes(nodesSource, evidenceItems)
    const { nodes, droppedStaleCount: nodeDropped } = await persistAlbumNodeImages(
      nodesSource.map((n) => ({
        id: n.id,
        title: n.title,
        status: (n.images && n.images.length) || n.note ? 'completed' : 'pending',
        images: n.images || [],
        note: n.note || '',
        comparePairRows: Array.isArray(n.comparePairRows) ? n.comparePairRows : [],
        updatedAt: new Date().toISOString(),
      }))
    )
    const normalized = normalizePlanAmountPayload({
      nodes,
      parts: overrides.parts != null ? overrides.parts : this.data.parts,
      planAmount: this.data.planAmount,
      vehicle: this.buildVehiclePayload(),
    })
    if (this.data.allowTestOwnerPhone && !this.data.hasOwner) {
      const ownerCheck = this.validateOwnerPhoneInput()
      if (ownerCheck.phone) {
        normalized.userPhone = ownerCheck.phone
      }
    }
    return {
      payload: {
        ...normalized,
        planParts: overrides.planParts != null ? overrides.planParts : this.data.planParts,
        partVerifyGuideText:
          this.data.partVerifyGuideMode === 'informed'
            ? ''
            : String(this.data.partVerifyGuideText || '').trim(),
        partVerifyGuideInformed: this.data.partVerifyGuideMode === 'informed',
        evidenceItems: sanitizeEvidenceItemsPayload(evidenceItems, { validPlanPartIds }),
      },
      droppedStaleCount: (nodeDropped || 0) + (evidenceDropped || 0),
    }
  },

  notifyStaleImagesDropped(count) {
    if (!count) return
    wx.showModal({
      title: '部分历史图片未保留',
      content: `有 ${count} 张图片来自旧版本地缓存，已无法上传。请在本页对应节点重新添加；本次新上传的图片已正常保存。`,
      showCancel: false,
      confirmText: '知道了',
    })
  },

  notifyImageGateResults(results) {
    const list = Array.isArray(results) ? results : []
    const hints = [...new Set(list.map((item) => item.hint).filter(Boolean))]
    if (!hints.length) return
    wx.showModal({
      title: '公开素材提示',
      content: hints.slice(0, 3).join('\n'),
      showCancel: false,
      confirmText: '知道了',
    })
  },

  notifyCopyQuality(copyQuality) {
    const report = copyQuality || null
    if (!report || !Array.isArray(report.suggestions) || !report.suggestions.length) return
    const blocks = report.suggestions.filter((s) => s.level === 'block')
    if (!blocks.length) return
    const lines = blocks
      .slice(0, 3)
      .map((s) => s.message)
      .filter(Boolean)
    if (!lines.length) return
    wx.showModal({
      title: '文案需修改',
      content: [report.summaryText, ...lines].filter(Boolean).join('\n'),
      showCancel: false,
      confirmText: '知道了',
    })
  },

  notifyPublicCaseQuality(quality) {
    const report = quality || null
    if (!report || report.publicCaseScore == null) return
    const pass = Boolean(report.publicCaseScorePass)
    const threshold = report.publicCaseScoreThreshold || 70
    const privacyBlocks = Array.isArray(report.privacyBlocks) ? report.privacyBlocks : []
    const qualityTips = (Array.isArray(report.qualitySuggestions)
      ? report.qualitySuggestions
      : (report.publicCaseSuggestions || []).filter((s) => s.category === 'quality')
    )
      .slice(0, 3)
      .map((s) => s.message)
      .filter(Boolean)
    const privacyLines = privacyBlocks
      .slice(0, 2)
      .map((s) => s.message)
      .filter(Boolean)
    const contentParts = [
      `质量分 ${report.publicCaseScore}（标准 ≥${threshold}）`,
      privacyBlocks.length
        ? '隐私/合规：须先处理下列问题，与质量分无关。'
        : pass
          ? '已达标，可引导车主授权公示。'
          : '质量分未达标，暂不宜引导车主授权公示。',
      report.publicCaseScoreSummary || '',
      privacyLines.length ? `必改项：\n${privacyLines.join('\n')}` : '',
      qualityTips.length ? `改善建议：\n${qualityTips.join('\n')}` : '',
    ].filter(Boolean)
    wx.showModal({
      title: pass ? '公示就绪评估' : privacyBlocks.length ? '公示就绪 · 隐私/合规未过' : '公示就绪评估 · 质量分未达标',
      content: contentParts.join('\n'),
      showCancel: false,
      confirmText: '知道了',
    })
  },

  async onSave() {
    if (this.data.saving) return
    if (!this.validateVehicle()) return
    if (!this.requireOwnerLinked('保存相册')) return
    if (this.data.allowTestOwnerPhone && !this.data.hasOwner) {
      const ownerCheck = this.validateOwnerPhoneInput()
      if (!ownerCheck.ok) {
        wx.showToast({ title: ownerCheck.message, icon: 'none' })
        return
      }
    }
    this.setData({ saving: true })
    try {
      wx.showLoading({ title: '保存中', mask: true })
      const { payload, droppedStaleCount } = await this.buildSavePayload()
      const detail = await saveMerchantServiceAlbum(this.albumId, payload)
      wx.hideLoading()
      wx.showToast({ title: '已保存', icon: 'success' })
      this.applyAlbum(detail)
      this.notifyStaleImagesDropped(droppedStaleCount)
      this.notifyImageGateResults(detail && detail.imageGateResults)
      this.notifyCopyQuality(detail && detail.copyQuality)
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  onComplete() {
    if (this.data.completing || this.data.saving) return
    if (!this.validateVehicle()) return
    if (!this.requireOwnerLinked('标记完工')) return
    if (!this.data.hasOwner) {
      if (this.data.allowTestOwnerPhone) {
        const ownerCheck = this.validateOwnerPhoneInput()
        if (!ownerCheck.ok || !ownerCheck.phone) {
          wx.showToast({ title: ownerCheck.message || '请先填写车主手机号', icon: 'none' })
          return
        }
      } else {
        wx.showToast({ title: '请先请车主扫码关联手机号', icon: 'none' })
        return
      }
    }
    const hasImage =
      this.data.nodes.some((n) => (n.images || []).length > 0) ||
      (this.data.evidenceItems || []).some((item) => (item.images || []).length > 0)
    if (!hasImage) {
      wx.showToast({ title: '请至少上传一张过程图', icon: 'none' })
      return
    }

    const view = this.computeMerchantInspectionState()
    const missing = collectMissingFromPanels(view.completeness.panels)
    this.setData({
      merchantInspSummary: view.completeness.summary,
      merchantInspPanels: view.completeness.panels,
      merchantInspColumnLabel: view.importanceColumnLabel,
      merchantInspMissingItems: missing,
    })
    if (missing.length) {
      this.setData({ inspCompleteModalVisible: true })
      return
    }

    this.showCompleteConfirmModal()
  },

  async submitComplete() {
    if (this.data.completing) return
    this.setData({ completing: true })
    try {
      wx.showLoading({ title: '提交中', mask: true })
      const { payload, droppedStaleCount } = await this.buildSavePayload()
      await saveMerchantServiceAlbum(this.albumId, payload)
      const completed = await completeMerchantServiceAlbum(this.albumId)
      wx.hideLoading()
      wx.showToast({ title: '已标记完工', icon: 'success', duration: 1500 })
      if (droppedStaleCount > 0) {
        this.notifyStaleImagesDropped(droppedStaleCount)
      }
      this.notifyCopyQuality(completed && completed.copyQuality)
      this.notifyPublicCaseQuality(completed)
      const detail = await fetchMerchantServiceAlbum(this.albumId)
      this.applyAlbum(detail)
      promptMerchantAuditSubscribe(this.albumId)
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ completing: false })
    }
  },

  onShareAppMessage() {
    const payload = buildOwnerShareMessage(this.data.detail)
    if (payload) return payload
    return {
      title: '辙见 · 服务相册',
      path: TOOL_HOME_PATH,
    }
  },

  onOpenContentOptimize() {
    if (!this.albumId) return
    wx.navigateTo({
      url: `/packageMerchant/pages/album/optimize/index?albumId=${this.albumId}`,
    })
  },

  onOpenCaseDraft() {
    if (!this.albumId) return
    wx.navigateTo({
      url: `/packageMerchant/pages/album/case-draft/index?albumId=${this.albumId}`,
    })
  },

  onInviteOwnerScan() {
    if (!this.albumId) return
    wx.navigateTo({
      url: `/packageMerchant/pages/album/invite/index?albumId=${this.albumId}`,
    })
  },

  onInspPreviewImage(e) {
    const { url, urls } = e.detail || {}
    const list = (urls || []).filter(Boolean)
    if (!url || !list.length) return
    wx.previewImage({ current: url, urls: list })
  },
})
