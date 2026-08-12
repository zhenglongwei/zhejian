const { SERVICE_ALBUM_STAGES, getStageMeta, resolveStagesForAlbumNodes } = require('../../../../constants/service-album-stages')
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
  exportMerchantCaseDraftCopy,
} = require('../../../../services/merchant-service-album')
const { fetchServiceAlbumTemplateOptions } = require('../../../../services/service-album-template')
const { resolveTemplateStageTitle } = require('../../../../constants/service-album-node-templates')
const {
  canShareToOwner,
  buildOwnerShareMessage,
} = require('../../../../utils/service-album-share')
const { TOOL_HOME_PATH } = require('../../../../utils/share-store-context')
const { resolveMerchantAlbumDisplayStatus } = require('../../../../utils/service-album-display')
const { draftToAiSummary } = require('../../../../utils/merchant-case-draft-display')
const {
  resolveAlbumHasOwner,
  MERCHANT_ALBUM_INVITE_PAGE,
} = require('../../../../utils/merchant-album-nav')

const CASE_DRAFT_PREVIEW_MAX = 120

function buildCaseDraftPreview(draft) {
  if (!draft || typeof draft !== 'object') {
    return { title: '', summary: '', hasDraft: false }
  }
  const title = String(draft.title || '').trim()
  let summary = String(draft.caseSummary || '').trim()
  if (!summary) summary = draftToAiSummary(draft)
  summary = String(summary || '').trim()
  const clipped =
    summary.length > CASE_DRAFT_PREVIEW_MAX
      ? `${summary.slice(0, CASE_DRAFT_PREVIEW_MAX).trim()}…`
      : summary
  return {
    title,
    summary: clipped,
    hasDraft: Boolean(title || clipped || draft.confirmedAt),
  }
}
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
  extractWarrantyFields,
  findWarrantyEvidenceItem,
  patchWarrantyFieldsInEvidence,
  normalizeImageEntries,
} = require('../../../../utils/album-evidence-items')
const {
  MERCHANT_OLD_PART_INTRO,
  MERCHANT_INSPECTION_HINT,
  MERCHANT_COMPLETE_INSP_TITLE,
  MERCHANT_COMPLETE_INSP_INTRO,
  MERCHANT_EXTRA_PART_SOP_STAGE3_HINT,
  MERCHANT_EXTRA_PART_SOP_STAGE4_HINT,
  MERCHANT_EXTRA_PART_SOP_LINK,
  MERCHANT_EXTRA_PART_SOP_MODAL_TITLE,
  MERCHANT_EXTRA_PART_SOP_MODAL_CONTENT,
  WARRANTY_DOCUMENT_ID,
  MERCHANT_WARRANTY_INTRO,
  MERCHANT_WARRANTY_DURATION_LABEL,
  MERCHANT_WARRANTY_DURATION_PLACEHOLDER,
  MERCHANT_WARRANTY_SCOPE_LABEL,
  MERCHANT_WARRANTY_SCOPE_PLACEHOLDER,
  MERCHANT_WARRANTY_NOTE_LABEL,
  MERCHANT_WARRANTY_NOTE_PLACEHOLDER,
} = require('../../../../constants/album-evidence-guide')
const {
  resolveComparePairRowsFromNodes,
  applyComparePairRowsToNodes,
  syncBeforeFromAssessmentRows,
  normalizeComparePairRows,
  padComparePairRowsForEdit,
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
  MERCHANT_PART_PHOTO_UPLOAD_HINT,
  MERCHANT_PART_VERIFY_GUIDE_MODE_TEXT_TITLE,
  MERCHANT_PART_VERIFY_GUIDE_MODE_TEXT_DESC,
  MERCHANT_PART_VERIFY_GUIDE_MODE_INFORMED_TITLE,
  MERCHANT_PART_VERIFY_GUIDE_MODE_INFORMED_DESC,
} = require('../../../../constants/part-verify-copy')

const PART_TYPE_LIST = Object.values(PART_TYPE)
const BODY_PAINT_TEMPLATE_ID = 'body_paint'
const ACCIDENT_TEMPLATE_ID = 'accident'
const COMPARE_STAGE_TEMPLATE_IDS = new Set([BODY_PAINT_TEMPLATE_ID, ACCIDENT_TEMPLATE_ID])
/** ALB-UX · 对比挂施工过程；存量完工对比仍可由 LEGACY 读 */
const STAGE_COMPARE_ID = 'stage_5'
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
  '如自动匹配不准确，可手动切换模板。切换后相册封面与检查类目会改为新类目名称；已上传图片不会删除。'

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
    vehicleModelYear: '',
    vehicleEngineModel: '',
    vehicleChassisCode: '',
    vinDecoding: false,
    isCompleted: false,
    readOnly: false,
    formDisabled: false,
    lockHint: '',
    hasOwner: false,
    publicCaseStatus: 'private',
    showCaseDraftEntry: false,
    caseDraftConfirmed: false,
    caseDraftPreviewTitle: '',
    caseDraftPreviewSummary: '',
    caseDraftHasPreview: false,
    showBottomPrimary: false,
    bottomPrimaryText: '',
    showBottomBar: true,
    ownerPhoneInput: '',
    allowTestOwnerPhone: true,
    uploadPrivacyHint: '',
    planStageUploadHint: '上传报价单，并填写方案说明',
    commonShootAvoidTags: ['少拍清晰车牌', '避免人脸入镜', '避免车钥匙入镜', '避免私人物品特写'],
    checklist: null,
    checklistCompleteness: null,
    checklistCategoryLabel: '',
    stageChecklistItems: [],
    workQueueItems: [],
    followUpItems: [],
    showStageChecklist: false,
    showWorkQueue: false,
    showFollowUpList: false,
    checklistStageHint: '',
    checklistStageTitle: '',
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
    partsCtaDraftPhotos: [],
    activeWizardIndex: -1,
    /** 配件项内仅挂载当前编辑的原生 input，避免挡住「上传凭证图」 */
    wizardFocusField: '',
    wizardPickingIndex: -1,
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
    partPhotoUploadHint: MERCHANT_PART_PHOTO_UPLOAD_HINT,
    partVerifyGuideModeTextTitle: MERCHANT_PART_VERIFY_GUIDE_MODE_TEXT_TITLE,
    partVerifyGuideModeTextDesc: MERCHANT_PART_VERIFY_GUIDE_MODE_TEXT_DESC,
    partVerifyGuideModeInformedTitle: MERCHANT_PART_VERIFY_GUIDE_MODE_INFORMED_TITLE,
    partVerifyGuideModeInformedDesc: MERCHANT_PART_VERIFY_GUIDE_MODE_INFORMED_DESC,
    partVerifyGuideMode: 'text',
    partVerifyGuideText: '',
    partVerifyGuideInformed: false,
    /** 未激活时不挂载原生 textarea，避免挡住上方上传按钮 */
    partVerifyTextareaReady: false,
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
    warrantyIntro: MERCHANT_WARRANTY_INTRO,
    warrantyDurationLabel: MERCHANT_WARRANTY_DURATION_LABEL,
    warrantyDurationPlaceholder: MERCHANT_WARRANTY_DURATION_PLACEHOLDER,
    warrantyScopeLabel: MERCHANT_WARRANTY_SCOPE_LABEL,
    warrantyScopePlaceholder: MERCHANT_WARRANTY_SCOPE_PLACEHOLDER,
    warrantyNoteLabel: MERCHANT_WARRANTY_NOTE_LABEL,
    warrantyNotePlaceholder: MERCHANT_WARRANTY_NOTE_PLACEHOLDER,
    warrantyDuration: '',
    warrantyScope: '',
    warrantyNote: '',
    extraPartSopStage3Hint: MERCHANT_EXTRA_PART_SOP_STAGE3_HINT,
    extraPartSopStage4Hint: MERCHANT_EXTRA_PART_SOP_STAGE4_HINT,
    extraPartSopLink: MERCHANT_EXTRA_PART_SOP_LINK,
    merchantInspHint: MERCHANT_INSPECTION_HINT,
    merchantInspSummary: { done: 0, total: 0, missing: 0 },
    merchantInspPanels: [],
    merchantInspColumnLabel: '建议',
    merchantInspExpanded: false,
    merchantInspMissingItems: [],
    inspScrollIntoView: '',
    inspCompleteModalVisible: false,
    inspCompleteModalTitle: MERCHANT_COMPLETE_INSP_TITLE,
    inspCompleteModalIntro: MERCHANT_COMPLETE_INSP_INTRO,
  },

  onLoad(options) {
    this.albumId = options.albumId || ''
    this.focusOwnerPhone = options.focusOwnerPhone === '1' || options.focusOwnerPhone === 'true'
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '服务相册信息缺失' })
      return
    }
    this.initPage()
  },

  maybeFocusOwnerPhone() {
    if (!this.focusOwnerPhone || this.data.hasOwner) return
    this.focusOwnerPhone = false
    setTimeout(() => {
      wx.pageScrollTo({
        selector: '#merchant-album-owner-phone',
        duration: 280,
      })
      wx.showToast({ title: '请填写车主手机号后保存', icon: 'none', duration: 2200 })
    }, 320)
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
    this.maybePromptUnresolvedWorkThenComplete()
  },

  /** 施工清单中仍无施工留证的项（完工时需逐项删除确认） */
  collectUnresolvedWorkQueueItems() {
    const processNode =
      (this.data.nodes || []).find((n) => n.id === STAGE_PROCESS_ID) || {}
    const constructionByKey = {}
    ;(processNode.images || []).forEach((img) => {
      const key = String((img && img.checklistItemKey) || '').trim()
      if (!key) return
      if (!constructionByKey[key]) constructionByKey[key] = []
      constructionByKey[key].push(img)
    })
    const queue =
      (this.data.workQueueItems && this.data.workQueueItems.length
        ? this.data.workQueueItems
        : null) ||
      (this.data.checklist && this.data.checklist.workQueueItems) ||
      []
    return (queue || []).filter((it) => {
      if (!it || !it.itemKey) return false
      const constructionImgs = constructionByKey[it.itemKey] || []
      if (constructionImgs.length > 0) return false
      if (it.outcome === 'replaced') return false
      return true
    })
  },

  canonicalizeRemovedAs(raw) {
    const v = String(raw || '').trim()
    if (v === 'skipped' || v === 'follow_up') return v
    if (v === 'mismatch') return 'skipped'
    if (v === 'owner_declined') return 'follow_up'
    return null
  },

  applyWorkRemoveReason(itemKey, removedAs, deferNote) {
    const canonical = this.canonicalizeRemovedAs(removedAs)
    this.syncChecklistLocalItems((it) => {
      if (it.itemKey !== itemKey) return it
      if (canonical === 'skipped') {
        const next = this.computeWorkFlags({
          ...it,
          work: {
            ...(it.work || {}),
            source: null,
            removedAs: 'skipped',
            deferNote: '',
          },
        })
        next.outcomeLabel = this.outcomeLabelOf(next.outcome, next.work)
        return next
      }
      const next = this.computeWorkFlags({
        ...it,
        outcome: it.outcome === 'replaced' ? 'not_replaced' : it.outcome || 'not_replaced',
        work: {
          ...(it.work || {}),
          removedAs: 'follow_up',
          deferNote: deferNote || '',
        },
      })
      next.outcomeLabel = this.outcomeLabelOf(next.outcome, next.work)
      return next
    })
  },

  /**
   * 删除两步：本次不做 → 是否记入跟进
   * @returns {Promise<'skipped'|'follow_up'|'cancel'>}
   */
  promptWorkRemoveReason(item) {
    const label = (item && item.label) || '该项目'
    return new Promise((resolve) => {
      wx.showModal({
        title: '本次不做',
        content: `确认将「${label}」从施工清单删除（本次不做）？`,
        confirmText: '确认删除',
        cancelText: '取消',
        success: (res) => {
          if (!res.confirm) {
            resolve('cancel')
            return
          }
          wx.showModal({
            title: '是否记入跟进',
            content: '需要记入跟进、方便回访再约吗？选「需要」将出现在完工节点的跟进清单。',
            confirmText: '需要跟进',
            cancelText: '不需要',
            success: (followRes) => {
              if (followRes.confirm) {
                wx.showModal({
                  title: `${label}：回访说明`,
                  editable: true,
                  placeholderText: '选填，如：车主改约下月',
                  success: (noteRes) => {
                    if (!noteRes.confirm) {
                      // 关掉说明仍记入跟进
                      this.applyWorkRemoveReason(item.itemKey, 'follow_up', '')
                      resolve('follow_up')
                      return
                    }
                    this.applyWorkRemoveReason(
                      item.itemKey,
                      'follow_up',
                      String(noteRes.content || '').trim(),
                    )
                    resolve('follow_up')
                  },
                  fail: () => {
                    this.applyWorkRemoveReason(item.itemKey, 'follow_up', '')
                    resolve('follow_up')
                  },
                })
                return
              }
              this.applyWorkRemoveReason(item.itemKey, 'skipped')
              resolve('skipped')
            },
            fail: () => resolve('cancel'),
          })
        },
        fail: () => resolve('cancel'),
      })
    })
  },

  async maybePromptUnresolvedWorkThenComplete() {
    const pending = this.collectUnresolvedWorkQueueItems()
    if (!pending.length) {
      this.showCompleteConfirmModal()
      return
    }
    for (let i = 0; i < pending.length; i += 1) {
      const it = pending[i]
      const choice = await new Promise((resolve) => {
        wx.showModal({
          title: '施工清单尚未完成',
          content: `「${it.label || '项目'}」仍在施工清单且未上传施工图。请删除并说明是否跟进，或取消完工。`,
          confirmText: '去删除',
          cancelText: '取消',
          success: (res) => resolve(res.confirm ? 'ask' : 'cancel'),
          fail: () => resolve('cancel'),
        })
      })
      if (choice !== 'ask') return
      const reason = await this.promptWorkRemoveReason(it)
      if (reason === 'cancel') return
    }
    this.showCompleteConfirmModal()
  },

  showCompleteConfirmModal() {
    const isResubmit = this.data.detail && this.data.detail.complianceStatus === 'rejected'
    wx.showModal({
      title: isResubmit ? '重新提交' : '确认完工',
      content: '将打开案例预览，确认后提交审核',
      confirmText: '去预览',
      success: (res) => {
        if (!res.confirm) return
        setTimeout(() => this.goCaseDraftForComplete(), 200)
      },
    })
  },

  async goCaseDraftForComplete() {
    if (!this.albumId) return
    try {
      wx.showLoading({ title: '准备预览', mask: true })
      const { payload, droppedStaleCount } = await this.buildSavePayload()
      await saveMerchantServiceAlbum(this.albumId, payload)
      wx.hideLoading()
      if (droppedStaleCount > 0) {
        this.notifyStaleImagesDropped(droppedStaleCount)
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/packageMerchant/pages/album/case-draft/index?albumId=${this.albumId}&from=complete`,
    })
  },

  async submitComplete() {
    // 保留兼容：直接完工须已确认案例稿；主路径改走案例预览
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
      const msg = (e && e.message) || '操作失败'
      if (String(e && e.code) === 'CASE_DRAFT_REQUIRED' || /案例稿/.test(msg)) {
        wx.showModal({
          title: '请先确认案例稿',
          content: msg,
          confirmText: '去预览',
          success: (res) => {
            if (res.confirm) this.goCaseDraftForComplete()
          },
        })
      } else {
        wx.showToast({ title: msg, icon: 'none' })
      }
    } finally {
      this.setData({ completing: false })
    }
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
    return resolveStagesForAlbumNodes(rawNodes).map((stage) => {
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
        notePlaceholder: '',
        captionPlaceholder:
          meta.captionPlaceholder ||
          stage.captionPlaceholder ||
          '本图说明（选填）',
        publicUploadHint: mergedMeta.publicUploadHint || '',
        images: normalizeImageEntries(node.images).map((entry) => ({
          url: normalizeStoredImageUrl(entry.url),
          caption: entry.caption || '',
          checklistItemKey: String(entry.checklistItemKey || '').trim(),
        })),
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
    return padComparePairRowsForEdit(resolveComparePairRowsFromNodes(nodes))
  },

  applyComparePairRowsToPage(pairRows) {
    const rows = padComparePairRowsForEdit(pairRows)
    const nodes = applyComparePairRowsToNodes(this.data.nodes, rows)
    this.setData({ comparePairRows: rows, nodes }, () => {
      this.refreshMerchantInspection()
    })
  },

  redirectToInviteIfNoOwner() {
    /* ALB-UX-11：允许在编辑页手填手机号，不再强制跳转扫码页 */
  },

  requireOwnerLinked(actionLabel) {
    if (this.data.hasOwner) return true
    const phone = normalizeOwnerPhone(this.data.ownerPhoneInput)
    if (phone.length === 11) return true
    wx.showModal({
      title: '请先关联车主',
      content: `${actionLabel || '上传过程图'}前，请填写车主手机号，或请车主扫码/打开分享链接关联。`,
      confirmText: '去关联页',
      cancelText: '知道了',
      success: (res) => {
        if (res.confirm) this.onInviteOwnerScan()
      },
    })
    return false
  },

  applyAlbum(detail) {
    let mergedNodes = this.mergeNodes(detail.nodes, detail.templateId)
    const commonShootAvoidTags = [
      '少拍清晰车牌',
      '避免人脸入镜',
      '避免车钥匙入镜',
      '避免私人物品特写',
    ]
    // 卷十五：清单替代教练 / photoTips 主引导
    mergedNodes = mergedNodes.map((n) => ({
      ...n,
      publicUploadHint: String(n.description || '').trim(),
      photoTips: '',
      compareGuidance: '',
    }))
    const evidenceItems = hydrateEvidenceItems({
      templateId: detail.templateId,
      savedItems: detail.evidenceItems || [],
      nodes: mergedNodes,
    })
    const warrantyFields = extractWarrantyFields(findWarrantyEvidenceItem(evidenceItems) || {})
    const nodes = applyProcessOnlyNodes(mergedNodes, evidenceItems)
    const stageTabs = this.buildStageTabs(nodes)
    const planAmount = resolvePlanAmount(detail)
    const canShare = canShareToOwner(detail)
    const isCompleted =
      detail.status === SERVICE_ALBUM_STATUS.COMPLETED ||
      detail.status === SERVICE_ALBUM_STATUS.PUBLISHED
    const readOnly =
      detail.contentLocked === true ||
      detail.editable === false ||
      (isCompleted && detail.complianceStatus !== 'rejected')
    const display = resolveMerchantAlbumDisplayStatus(detail.status)
    const hasOwnerPhone = Boolean(String(detail.userPhone || '').trim())
    const hasOwner = Boolean(detail.hasOwner) || hasOwnerPhone
    const publicCaseStatus = detail.publicCaseStatus || 'private'
    const canSwitchTemplate =
      !readOnly &&
      !isCompleted &&
      publicCaseStatus === 'private' &&
      detail.status !== 'pending_review'
    let showBottomPrimary = false
    let bottomPrimaryText = ''
    if (
      !readOnly &&
      detail.status !== SERVICE_ALBUM_STATUS.COMPLETED &&
      detail.status !== SERVICE_ALBUM_STATUS.PUBLISHED
    ) {
      showBottomPrimary = true
      bottomPrimaryText = '确认完工'
    }
    // 驳回后仍为 completed：主按钮改为「重新提交」
    if (!readOnly && isCompleted && detail.complianceStatus === 'rejected') {
      showBottomPrimary = true
      bottomPrimaryText = '重新提交'
    }
    const caseDraftConfirmed = Boolean(
      detail.merchantCaseDraft && detail.merchantCaseDraft.confirmedAt,
    )
    const caseDraftPreview = buildCaseDraftPreview(detail.merchantCaseDraft)
    const showCaseDraftEntry = isCompleted && !detail.isAuthorized
    let lockHint = ''
    if (readOnly) {
      if (
        publicCaseStatus === 'pending_desensitize' ||
        detail.publicCaseStatus === 'pending_desensitize'
      ) {
        lockHint = '已确认完工，配图脱敏处理中。相册与案例稿只读；脱敏结束后进入案例审核。'
      } else if (detail.complianceStatus === 'pending' || publicCaseStatus === 'pending_review') {
        lockHint = '已确认完工，案例审核中。相册与案例稿只读；驳回后方可再改。'
      } else if (detail.isAuthorized) {
        lockHint = '车主已发布或已提交发布，相册只读。'
      } else if (
        detail.complianceStatus === 'passed' ||
        publicCaseStatus === 'review_passed' ||
        publicCaseStatus === 'public_approved'
      ) {
        lockHint = '案例已通过审核，相册只读。车主可查看并发布；撤回不会解锁。'
      } else {
        lockHint = '已确认完工，相册只读。仅平台案例审核驳回后可再编辑。'
      }
    } else if (detail.complianceStatus === 'rejected') {
      lockHint = detail.complianceRejectReason
        ? `审核未通过：${detail.complianceRejectReason}`
        : '审核未通过'
    }
    const comparePairRows = this.initComparePairRowsFromNodes(nodes, detail.templateId || '')
    const checklist = this.normalizeChecklistView(detail.checklist || null)
    wx.setNavigationBarTitle({ title: readOnly ? '服务相册' : '编辑服务相册' })
    this.setData({
      status: 'normal',
      detail,
      statusLabel: display.statusLabel,
      statusVariant: display.statusVariant,
      stageTabs,
      nodes,
      comparePairRows,
      commonShootAvoidTags,
      checklist,
      checklistCompleteness: (checklist && checklist.completeness) || null,
      checklistCategoryLabel: (checklist && checklist.categoryLabel) || '',
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
      vehicleModelYear: (detail.vehicle && detail.vehicle.modelYear) || '',
      vehicleEngineModel: (detail.vehicle && detail.vehicle.engineModel) || '',
      vehicleChassisCode: (detail.vehicle && detail.vehicle.chassisCode) || '',
      isCompleted,
      readOnly,
      formDisabled: readOnly,
      lockHint,
      hasOwner,
      publicCaseStatus,
      showCaseDraftEntry,
      caseDraftConfirmed,
      caseDraftPreviewTitle: caseDraftPreview.title,
      caseDraftPreviewSummary: caseDraftPreview.summary,
      caseDraftHasPreview: caseDraftPreview.hasDraft,
      showBottomPrimary,
      bottomPrimaryText,
      showBottomBar: !readOnly,
      templateId: detail.templateId || '',
      templateName: detail.templateName || '',
      templatePickerIndex: this.syncTemplatePickerIndex(detail.templateId),
      canSwitchTemplate,
      planParts: detail.planParts || [],
      partVerifyGuideText: detail.partVerifyGuideText || '',
      partVerifyGuideInformed: Boolean(detail.partVerifyGuideInformed),
      partVerifyGuideMode: detail.partVerifyGuideInformed ? 'informed' : 'text',
      partVerifyTextareaReady: Boolean(
        !detail.partVerifyGuideInformed && String(detail.partVerifyGuideText || '').trim(),
      ),
      ownerPhoneInput: String(detail.userPhone || '').replace(/\D/g, '') || this.data.ownerPhoneInput,
      evidenceItems,
      oldPartTraces: extractOldPartTraces(evidenceItems),
      warrantyDuration: warrantyFields.duration,
      warrantyScope: warrantyFields.scope,
      warrantyNote: warrantyFields.note,
    }, () => {
      this.refreshCompareStageFlags(this.data.stageIndex)
      this.refreshChecklistStageViews()
      this.refreshPartWizard()
      this.refreshMerchantInspection()
      this.redirectToInviteIfNoOwner(detail)
      this.maybeFocusOwnerPhone()
    })
    this.syncShareMenu(canShare)
  },

  attachStageImagesToItems(items, stageId) {
    const node = (this.data.nodes || []).find((n) => n.id === stageId) || {}
    const byKey = {}
    ;(node.images || []).forEach((img) => {
      const key = String((img && img.checklistItemKey) || '').trim()
      if (!key) return
      if (!byKey[key]) byKey[key] = []
      byKey[key].push(img)
    })
    return (items || []).map((it) => ({
      ...it,
      stageImages: byKey[it.itemKey] || [],
    }))
  },

  refreshChecklistStageViews(stageIndex = this.data.stageIndex) {
    const checklist = this.data.checklist || {}
    const stageId =
      (this.data.stages[stageIndex] && this.data.stages[stageIndex].id) || ''
    const stageMap = checklist.stageItems || {}
    const allItems = checklist.items || []
    // 施工不展示固定未检查清单：仅施工清单（检测解锁的衍生项）
    const showStageChecklist =
      stageId === 'stage_1' || stageId === 'stage_2' || stageId === 'stage_6'
    // 施工仅施工清单；跟进仅完工
    const showWorkQueue = stageId === STAGE_PROCESS_ID
    const showFollowUpList = stageId === 'stage_6'
    let stageChecklistItems = []
    let checklistStageHint = ''
    let checklistStageTitle = this.data.checklistCategoryLabel || '检查项目'
    if (stageId === 'stage_1') {
      stageChecklistItems = this.attachStageImagesToItems(stageMap.stage_1 || [], stageId)
      checklistStageTitle = '接车检查项'
      checklistStageHint = '接车建档项：点开拍照或写说明。异常结果才会进施工清单。'
    } else if (stageId === 'stage_2') {
      stageChecklistItems = this.attachStageImagesToItems(stageMap.stage_2 || [], stageId)
      checklistStageTitle = '检测检查项'
      checklistStageHint =
        '检测判断项：点开拍照。除「正常」外进施工清单；如旧机油需更换，会自动带出新机油规格/液位等施工项。'
    } else if (stageId === 'stage_6') {
      stageChecklistItems = this.attachStageImagesToItems(stageMap.stage_6 || [], stageId)
      checklistStageTitle = '完工交付项'
      checklistStageHint = '完工交付项：复查、试车与交车说明。'
    }
    const rawQueue = (checklist.workQueueItems || []).length
      ? checklist.workQueueItems
      : allItems.filter((it) => this.isConstructionQueueItem(it))
    const workQueueItems = this.attachStageImagesToItems(
      (rawQueue || []).filter((it) => this.isConstructionQueueItem(it)),
      stageId === 'stage_6' ? 'stage_6' : STAGE_PROCESS_ID,
    )
    const followUpItems = checklist.followUpItems || allItems.filter((it) => it.inFollowUp)
    const nodes = (this.data.nodes || []).map((n) => {
      if (n.id !== stageId) return n
      const images = n.images || []
      const otherImages = images.filter((img) => !String((img && img.checklistItemKey) || '').trim())
      return { ...n, otherImages }
    })
    this.setData({
      nodes,
      showStageChecklist,
      showWorkQueue,
      showFollowUpList,
      stageChecklistItems,
      workQueueItems,
      followUpItems,
      checklistStageTitle,
      checklistStageHint,
      checklistCompleteness: checklist.completeness || null,
      checklistCategoryLabel: checklist.categoryLabel || '',
    })
  },

  /** 服务端/本地清单统一按「施工=检测延伸」重算队列 */
  normalizeChecklistView(checklist) {
    if (!checklist || !Array.isArray(checklist.items)) return checklist
    // 先按留证+结果重算进队，再解锁衍生项（避免无图残留 outcome 冒进）
    const recomputed = (checklist.items || []).map((it) => {
      const next = this.computeWorkFlags(it)
      next.outcomeLabel = this.outcomeLabelOf(next.outcome, next.work)
      return next
    })
    const items = this.applyWorkFollowUpUnlock(recomputed)
    const workQueueItems = items.filter((it) => this.isConstructionQueueItem(it))
    const followUpItems = items.filter((it) => it.inFollowUp)
    const listable = (it, stageId) => !it.workOnly && it.suggestStageId === stageId
    const stageItems = {
      stage_1: items.filter((it) => listable(it, 'stage_1')),
      stage_2: items.filter((it) => listable(it, 'stage_2')),
      stage_5: [],
      stage_6: items.filter((it) => listable(it, 'stage_6')),
    }
    return {
      ...checklist,
      items,
      stageItems,
      workQueueItems,
      followUpItems,
      completeness: {
        ...(checklist.completeness || {}),
        workQueueCount: workQueueItems.length,
        followUpCount: followUpItems.length,
      },
    }
  },

  itemHasChecklistEvidence(it) {
    return Boolean(
      (it.images && it.images.length) ||
        (it.stageImages && it.stageImages.length) ||
        String((it && it.note) || '').trim(),
    )
  },

  parentCanUnlockFollowUps(it) {
    if (!it || it.workOnly) return false
    if (!(it.workFollowUpKeys || []).length) return false
    if (it.work && it.work.removedAs) return false
    if (!this.itemHasChecklistEvidence(it)) return false
    if (it.outcome === 'normal') return false
    return Boolean(it.inWorkQueue)
  },

  isConstructionQueueItem(it) {
    if (!it || !it.inWorkQueue) return false
    // 有衍生项的检测父项（旧机油等）不进施工列表
    if (!it.workOnly && (it.workFollowUpKeys || []).length > 0) return false
    return true
  },

  applyWorkFollowUpUnlock(items) {
    const list = (items || []).map((it) => ({
      ...it,
      workOnly: Boolean(it.workOnly || it.suggestStageId === 'stage_5'),
      workFollowUpKeys: Array.isArray(it.workFollowUpKeys) ? it.workFollowUpKeys : [],
    }))
    const unlocked = new Set()
    list.forEach((it) => {
      if (!this.parentCanUnlockFollowUps(it)) return
      ;(it.workFollowUpKeys || []).forEach((k) => unlocked.add(String(k)))
    })
    return list.map((it) => {
      if (!it.workOnly) return it
      const work = {
        ...(it.work || {}),
        removedAs: this.canonicalizeRemovedAs(it.work && it.work.removedAs),
      }
      if (work.removedAs === 'follow_up') {
        return { ...it, work, inWorkQueue: false, inFollowUp: true, unlockedByParent: unlocked.has(it.itemKey) }
      }
      if (work.removedAs === 'skipped') {
        return { ...it, work, inWorkQueue: false, inFollowUp: false, unlockedByParent: false }
      }
      const unlockedByParent = unlocked.has(it.itemKey)
      const manual = work.source === 'manual_add'
      const nextWork = unlockedByParent && !work.source ? { ...work, source: 'auto' } : work
      return {
        ...it,
        work: nextWork,
        inWorkQueue: Boolean(unlockedByParent || manual),
        inFollowUp: false,
        unlockedByParent,
      }
    })
  },

  syncChecklistLocalItems(mapper) {
    const checklist = this.data.checklist || { items: [] }
    const items = this.applyWorkFollowUpUnlock((checklist.items || []).map(mapper))
    const workQueueItems = items.filter((it) => this.isConstructionQueueItem(it))
    const followUpItems = items.filter((it) => it.inFollowUp)
    const listable = (it, stageId) => !it.workOnly && it.suggestStageId === stageId
    const stageItems = {
      stage_1: items.filter((it) => listable(it, 'stage_1')),
      stage_2: items.filter((it) => listable(it, 'stage_2')),
      stage_5: [],
      stage_6: items.filter((it) => listable(it, 'stage_6')),
    }
    const completeness = {
      ...(checklist.completeness || {}),
      workQueueCount: workQueueItems.length,
      followUpCount: followUpItems.length,
    }
    this.setData(
      {
        checklist: {
          ...checklist,
          items,
          stageItems,
          workQueueItems,
          followUpItems,
          completeness,
        },
      },
      () => this.refreshChecklistStageViews(),
    )
  },

  computeWorkFlags(item) {
    const rawRemoved = (item.work && item.work.removedAs) || null
    const removedAs = this.canonicalizeRemovedAs(rawRemoved)
    const work = {
      source: (item.work && item.work.source) || null,
      removedAs,
      deferNote: (item.work && item.work.deferNote) || '',
    }
    if (removedAs === 'follow_up') {
      return { ...item, work, inWorkQueue: false, inFollowUp: true }
    }
    if (removedAs === 'skipped') {
      return { ...item, work, inWorkQueue: false, inFollowUp: false }
    }
    const captions = [
      ...((item.stageImages || []).map((img) => String((img && img.caption) || ''))),
      ...((item.images || []).map((img) => String((img && img.caption) || ''))),
    ]
    const isNormalOnly = (t) => {
      const s = String(t || '').trim()
      if (!s) return true
      if (!/^正常(；|;|：|:)?/.test(s)) return false
      const rest = s.replace(/^正常(；|;|：|:)?\s*/, '')
      return !/建议更换|需处理|仅检查|已更换|未更换|已处理/.test(rest)
    }
    const needsConstruction = (t) => {
      const s = String(t || '').trim()
      if (!s || isNormalOnly(s)) return false
      if (/^仅检查(；|;|：|:)?/.test(s)) {
        const rest = s.replace(/^仅检查(；|;|：|:)?\s*/, '')
        return /建议更换|需处理|已更换|未更换|已处理/.test(rest)
      }
      return true
    }
    const fromCaptions = captions.some((c) => needsConstruction(c))
    let inferred = item.outcome || null
    if (captions.some((t) => /建议更换/.test(t))) inferred = 'recommend_replace'
    else if (captions.some((t) => /需处理|已处理/.test(t))) inferred = 'repaired_other'
    else if (captions.some((t) => /已更换/.test(t))) inferred = 'replaced'
    else if (captions.some((t) => /未更换/.test(t))) inferred = 'not_replaced'
    else if (captions.some((t) => /^仅检查/.test(String(t || '').trim()))) inferred = 'observed'
    else if (fromCaptions) inferred = 'repaired_other'
    else if (captions.filter(Boolean).length && captions.filter(Boolean).every(isNormalOnly)) {
      inferred = 'normal'
    }
    const outcome = item.outcome || inferred
    const evidenced = this.itemHasChecklistEvidence(item)
    // 无检测留证不得进施工（手增除外）；「仅检查」不进
    const auto =
      evidenced &&
      (['recommend_replace', 'replaced', 'not_replaced', 'repaired_other'].includes(outcome) ||
        fromCaptions)
    const manual = work.source === 'manual_add'
    return {
      ...item,
      outcome,
      work,
      inWorkQueue: Boolean(auto || manual),
      inFollowUp: false,
    }
  },

  outcomeLabelOf(outcome, work) {
    const labels = {
      normal: '正常',
      observed: '已检查',
      recommend_replace: '建议更换',
      replaced: '已更换',
      not_replaced: '建议更换 · 本次未更换',
      repaired_other: '需处理 / 已处理',
    }
    const removedAs = this.canonicalizeRemovedAs(work && work.removedAs)
    if (removedAs === 'follow_up') {
      return work.deferNote ? `择日再约：${work.deferNote}` : '择日再约'
    }
    return outcome ? labels[outcome] || outcome : ''
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
        this.refreshChecklistStageViews(index)
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
      content: `将切换为「${picked.name}」。相册封面与检查类目会一并改为该类目名称；已上传图片会保留在同阶段节点上，完整度将重新计算。`,
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
    const prevWarranty = findWarrantyEvidenceItem(this.data.evidenceItems) || {}
    const otherItems = (this.data.evidenceItems || []).filter(
      (item) =>
        item &&
        (item.stageId !== stageId || isOldPartEvidenceItem(item)),
    )
    const stageItems = items.map((item) => {
      const next = { ...item, stageId: item.stageId || stageId }
      if (item && item.id === WARRANTY_DOCUMENT_ID) {
        return {
          ...next,
          ...extractWarrantyFields({
            duration: this.data.warrantyDuration || prevWarranty.duration,
            scope: this.data.warrantyScope || prevWarranty.scope,
            note: this.data.warrantyNote || prevWarranty.note,
          }),
        }
      }
      return next
    })
    const evidenceItems = [...otherItems, ...stageItems]
    this.setData({ evidenceItems }, () => {
      this.refreshStageEvidenceUI(this.data.stageIndex)
      this.refreshMerchantInspection()
    })
  },

  syncWarrantyFieldsIntoEvidence(fields = {}) {
    const nextFields = extractWarrantyFields({
      duration: fields.duration != null ? fields.duration : this.data.warrantyDuration,
      scope: fields.scope != null ? fields.scope : this.data.warrantyScope,
      note: fields.note != null ? fields.note : this.data.warrantyNote,
    })
    const evidenceItems = patchWarrantyFieldsInEvidence(this.data.evidenceItems, nextFields)
    this.setData(
      {
        evidenceItems,
        warrantyDuration: nextFields.duration,
        warrantyScope: nextFields.scope,
        warrantyNote: nextFields.note,
      },
      () => this.refreshMerchantInspection(),
    )
  },

  onWarrantyFieldInput(e) {
    const field = e.currentTarget.dataset.field
    if (!field) return
    const value = e.detail.value
    const patch = {}
    if (field === 'duration') patch.duration = value
    if (field === 'scope') patch.scope = value
    if (field === 'note') patch.note = value
    this.syncWarrantyFieldsIntoEvidence(patch)
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

  stampImagesWithChecklistKey(prevImages, nextImages) {
    const activeKey = String(this.data.activeChecklistItemKey || '').trim()
    const prevByUrl = new Map()
    ;(prevImages || []).forEach((entry) => {
      const url =
        typeof entry === 'string'
          ? entry.trim()
          : String((entry && (entry.url || entry.rawUrl || entry.src)) || '').trim()
      if (!url) return
      prevByUrl.set(url, entry)
    })
    return (nextImages || []).map((entry) => {
      if (typeof entry === 'string') {
        const url = entry.trim()
        const prev = prevByUrl.get(url)
        const prevKey =
          prev && typeof prev === 'object'
            ? String(prev.checklistItemKey || '').trim()
            : ''
        return {
          url,
          caption: '',
          checklistItemKey: prevKey || activeKey || '',
        }
      }
      const url = String((entry && (entry.url || entry.rawUrl || entry.src)) || '').trim()
      const prev = prevByUrl.get(url)
      const existing = String((entry && entry.checklistItemKey) || '').trim()
      const prevKey =
        prev && typeof prev === 'object'
          ? String(prev.checklistItemKey || '').trim()
          : ''
      const isNew = Boolean(url) && !prevByUrl.has(url)
      return {
        ...entry,
        caption: String((entry && entry.caption) || '').trim(),
        checklistItemKey: existing || prevKey || (isNew ? activeKey : '') || '',
      }
    })
  },

  onChecklistNoteChange(e) {
    if (this.data.readOnly) return
    const itemKey = String((e.detail && e.detail.itemKey) || '').trim()
    const note = String((e.detail && e.detail.note) || '').trim().slice(0, 500)
    this.syncChecklistLocalItems((it) => {
      if (it.itemKey !== itemKey) return it
      return this.computeWorkFlags({ ...it, note })
    })
  },

  onChecklistOutcomeChange(e) {
    if (this.data.readOnly) return
    const itemKey = String((e.detail && e.detail.itemKey) || '').trim()
    const outcome = e.detail && e.detail.outcome != null ? e.detail.outcome : null
    this.syncChecklistLocalItems((it) => {
      if (it.itemKey !== itemKey) return it
      const next = this.computeWorkFlags({ ...it, outcome })
      next.outcomeLabel = this.outcomeLabelOf(next.outcome, next.work)
      return next
    })
  },

  onChecklistItemImagesChange(e) {
    if (this.data.readOnly) return
    const itemKey = String((e.detail && e.detail.itemKey) || '').trim()
    if (!itemKey) return
    const stageId =
      String((e.detail && e.detail.stageId) || '').trim() ||
      (this.data.stages[this.data.stageIndex] && this.data.stages[this.data.stageIndex].id) ||
      ''
    const nodes = this.data.nodes.slice()
    const index = nodes.findIndex((n) => n.id === stageId)
    if (index < 0) return
    const prevImages = nodes[index].images || []
    const keep = prevImages.filter(
      (img) => String((img && img.checklistItemKey) || '').trim() !== itemKey,
    )
    const incoming = ((e.detail && e.detail.images) || []).map((entry) => {
      if (typeof entry === 'string') {
        return { url: entry, caption: '', checklistItemKey: itemKey }
      }
      return {
        ...entry,
        url: String((entry && (entry.url || entry.rawUrl || entry.src)) || '').trim(),
        caption: String((entry && entry.caption) || '').trim(),
        checklistItemKey: itemKey,
      }
    }).filter((img) => img.url)
    nodes[index].images = keep.concat(incoming)
    this.setData({ nodes }, () => {
      this.syncChecklistLocalItems((it) => {
        if (it.itemKey !== itemKey) return it
        const prevInQueue = Boolean(it.inWorkQueue || it.unlockedByParent)
        const next = this.computeWorkFlags({
          ...it,
          stageImages: incoming,
          images: incoming,
          // 保留原结果，避免上传瞬间因尚未点标签而掉出施工列表
          outcome: it.outcome,
        })
        // 施工衍生项：上传过程图后仍须留在施工清单，直到商家删除
        if (it.workOnly && prevInQueue && !next.work.removedAs) {
          next.inWorkQueue = true
          next.unlockedByParent = true
          next.work = {
            ...next.work,
            source: next.work.source || 'auto',
          }
        }
        next.outcomeLabel = this.outcomeLabelOf(next.outcome, next.work)
        return next
      })
      this.refreshMerchantInspection()
    })
  },

  onChecklistAddWork(e) {
    if (this.data.readOnly) return
    const itemKey = String((e.detail && e.detail.itemKey) || '').trim()
    this.syncChecklistLocalItems((it) => {
      if (it.itemKey !== itemKey) return it
      const next = this.computeWorkFlags({
        ...it,
        work: { ...(it.work || {}), source: 'manual_add', removedAs: null, deferNote: '' },
      })
      next.outcomeLabel = this.outcomeLabelOf(next.outcome, next.work)
      return next
    })
    wx.showToast({ title: '已加入施工清单', icon: 'success' })
  },

  onChecklistRemoveWork(e) {
    if (this.data.readOnly) return
    const itemKey = String((e.detail && e.detail.itemKey) || '').trim()
    if (!itemKey) return
    const items = (this.data.checklist && this.data.checklist.items) || []
    const item = items.find((it) => it.itemKey === itemKey) || { itemKey, label: '该项目' }
    this.promptWorkRemoveReason(item)
  },

  onChecklistRestoreWork(e) {
    if (this.data.readOnly) return
    const itemKey = String((e.detail && e.detail.itemKey) || '').trim()
    this.syncChecklistLocalItems((it) => {
      if (it.itemKey !== itemKey) return it
      const next = this.computeWorkFlags({
        ...it,
        work: {
          ...(it.work || {}),
          source: 'manual_add',
          removedAs: null,
          deferNote: '',
        },
      })
      next.outcomeLabel = this.outcomeLabelOf(next.outcome, next.work)
      return next
    })
  },

  onOtherNodeImages(e) {
    if (this.data.readOnly) return
    let index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) index = this.data.stageIndex
    const nodes = this.data.nodes.slice()
    const node = nodes[index]
    if (!node) return
    const keyed = (node.images || []).filter((img) =>
      String((img && img.checklistItemKey) || '').trim(),
    )
    const others = ((e.detail && e.detail.images) || []).map((entry) => {
      if (typeof entry === 'string') return { url: entry, caption: '', checklistItemKey: '' }
      return {
        ...entry,
        url: String((entry && (entry.url || entry.rawUrl || entry.src)) || '').trim(),
        caption: String((entry && entry.caption) || '').trim(),
        checklistItemKey: '',
      }
    }).filter((img) => img.url)
    nodes[index] = {
      ...node,
      images: keyed.concat(others),
      otherImages: others,
    }
    this.setData({ nodes }, () => this.refreshMerchantInspection())
  },

  onNodeImages(e) {
    if (this.data.readOnly) return
    let index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) {
      index = this.data.stageIndex
    }
    if (!Number.isFinite(index)) return
    const nodes = this.data.nodes.slice()
    const prevImages = nodes[index].images || []
    nodes[index].images = this.stampImagesWithChecklistKey(
      prevImages,
      (e.detail && e.detail.images) || [],
    )
    const updates = { nodes }

    if (
      COMPARE_STAGE_TEMPLATE_IDS.has(this.data.templateId) &&
      nodes[index].id === STAGE_ASSESSMENT_ID
    ) {
      const assessment = nodes[index].images || []
      const rows = padComparePairRowsForEdit(
        syncBeforeFromAssessmentRows(this.data.comparePairRows, assessment)
      )
      updates.comparePairRows = rows
      updates.nodes = applyComparePairRowsToNodes(nodes, rows)
    }

    this.setData(updates, () => {
      this.refreshChecklistStageViews()
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
    if (this.data.readOnly) return
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
    const plate = String(this.data.vehiclePlate || existing.plate || '')
      .trim()
      .replace(/[\s·.]/g, '')
      .toUpperCase()
    const vin = String(this.data.vehicleVin || existing.vin || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
    if (plate) payload.plate = plate
    if (vin) payload.vin = vin
    const modelYear = String(this.data.vehicleModelYear || existing.modelYear || '').trim()
    if (modelYear) payload.modelYear = modelYear
    const engineModel = String(this.data.vehicleEngineModel || existing.engineModel || '').trim()
    if (engineModel) payload.engineModel = engineModel
    const chassisCode = String(this.data.vehicleChassisCode || existing.chassisCode || '').trim()
    if (chassisCode) payload.chassisCode = chassisCode
    if (existing.mileage != null && existing.mileage !== '') {
      payload.mileage = existing.mileage
    }
    ;['displacement', 'gearbox', 'vinDecodedAt'].forEach((key) => {
      if (existing[key]) payload[key] = existing[key]
    })
    return payload
  },

  async onDecodeVin() {
    if (this.data.readOnly || this.data.vinDecoding) return
    const vin = String(this.data.vehicleVin || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
    if (vin.length !== 17) {
      wx.showToast({ title: '请先填写 17 位车架号', icon: 'none' })
      return
    }
    this.setData({ vinDecoding: true })
    try {
      const { decodeMerchantVin } = require('../../../../services/merchant-service-album')
      const data = await decodeMerchantVin(vin)
      const vehicle = (data && data.vehicle) || {}
      const patch = { vinDecoding: false }
      if (vehicle.brand) patch.vehicleBrand = vehicle.brand
      if (vehicle.series) patch.vehicleSeries = vehicle.series
      if (vehicle.modelYear) patch.vehicleModelYear = vehicle.modelYear
      if (vehicle.engineModel) patch.vehicleEngineModel = vehicle.engineModel
      if (vehicle.chassisCode) patch.vehicleChassisCode = vehicle.chassisCode
      if (vehicle.vin) patch.vehicleVin = vehicle.vin
      const detail = { ...(this.data.detail || {}) }
      detail.vehicle = {
        ...(detail.vehicle || {}),
        ...vehicle,
        brand: vehicle.brand || this.data.vehicleBrand,
        series: vehicle.series || this.data.vehicleSeries,
        vin: vehicle.vin || vin,
      }
      patch.detail = detail
      this.setData(patch)
      wx.showToast({ title: '已解析车型', icon: 'success' })
    } catch (err) {
      this.setData({ vinDecoding: false })
      wx.showToast({
        title: (err && err.message) || '解析失败，请手工填写',
        icon: 'none',
      })
    }
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
    // 方案节点单据图在 evidence 槽（repair_quote），applyProcessOnlyNodes 后不在 node.images
    const quoteSlot = (this.data.evidenceItems || []).find(
      (item) => item && item.id === 'repair_quote',
    )
    const slotImages = (quoteSlot && quoteSlot.images) || []
    for (let i = slotImages.length - 1; i >= 0; i -= 1) {
      const url = normalizeStoredImageUrl(slotImages[i])
      if (url) return url
    }
    const node = (this.data.nodes || []).find(
      (item) => item && (item.id === STAGE_PLAN_ID || item.nodeId === STAGE_PLAN_ID),
    )
    const images = (node && node.images) || []
    for (let i = images.length - 1; i >= 0; i -= 1) {
      const url = normalizeStoredImageUrl(images[i])
      if (url) return url
    }
    return ''
  },

  onAddPartRow() {
    if (this.data.readOnly) return
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

  onPartsCtaPhotosChange(e) {
    const photos = ((e.detail && e.detail.images) || []).filter(Boolean)
    if (!photos.length) {
      this.setData({ partsCtaDraftPhotos: [] })
      return
    }
    this.applyPartsCtaPhotos(photos)
  },

  applyPartsCtaPhotos(photos) {
    const list = (photos || []).filter(Boolean)
    if (!list.length) return
    const { planParts, parts } = appendManualPartRow(this.data.planParts, this.data.parts, {
      partName: `配件 ${(this.data.partWizardRows || []).length + 1}`,
      photos: list,
    })
    const mapped = this.mapPartsWithVariants(parts)
    this.setData(
      {
        planParts,
        parts: mapped,
        activeWizardIndex: Math.max((planParts || []).length - 1, 0),
        partsCtaDraftPhotos: [],
      },
      () => this.refreshPartWizard(),
    )
  },

  onAddPartByPhotos() {
    if (this.data.saving || this.data.completing || this.data.switching) {
      wx.showToast({ title: '请稍候再试', icon: 'none' })
      return
    }
    this.setData({ wizardFocusField: '' })
    this.onAddPartRow()
    wx.showToast({ title: '请先上传凭证图', icon: 'none' })
  },

  isDevtoolsEnv() {
    try {
      const info = wx.getSystemInfoSync() || {}
      return String(info.platform || '').toLowerCase() === 'devtools'
    } catch (err) {
      return false
    }
  },

  pickImages({ count = 3, onSuccess, onFail, onComplete } = {}) {
    const finish = (err, paths) => {
      if (typeof onComplete === 'function') onComplete()
      if (err) {
        if (typeof onFail === 'function') onFail(err)
        return
      }
      if (typeof onSuccess === 'function') onSuccess((paths || []).filter(Boolean))
    }
    const isCancel = (err) => /cancel/i.test(String((err && err.errMsg) || ''))
    // 只用一种选图 API，取消时绝不串第二套，否则会「取消后又弹一次」
    if (typeof wx.chooseMedia === 'function') {
      wx.chooseMedia({
        count,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => finish(null, (res.tempFiles || []).map((f) => f.tempFilePath)),
        fail: (err) => {
          if (isCancel(err) || typeof wx.chooseImage !== 'function') {
            finish(err)
            return
          }
          // 非取消的真实失败才回退 chooseImage
          wx.chooseImage({
            count,
            sizeType: ['compressed'],
            sourceType: ['album', 'camera'],
            success: (res) => finish(null, res.tempFilePaths || []),
            fail: finish,
          })
        },
      })
      return
    }
    if (typeof wx.chooseImage === 'function') {
      wx.chooseImage({
        count,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => finish(null, res.tempFilePaths || []),
        fail: finish,
      })
      return
    }
    finish({ errMsg: 'chooseImage:fail not support' })
  },

  /**
   * 开发者工具常无法调起系统相册（平台限制）。提供占位图，便于继续测填写/保存。
   */
  offerDevtoolsPhotoMock({ index, current, reason }) {
    const inTools = this.isDevtoolsEnv()
    const title = inTools ? '开发者工具无法打开相册' : '无法打开相册'
    const content = inTools
      ? '这是微信开发者工具的已知限制，不是配件页逻辑没写通。可插入占位图继续测流程，真实选图请用真机预览。'
      : `选图失败：${reason || '请检查相册权限后重试'}。也可先插入占位图继续填写。`
    wx.showModal({
      title,
      content,
      confirmText: '用占位图',
      cancelText: '知道了',
      success: (res) => {
        if (!res.confirm) return
        const mock = '/assets/icon/add.png'
        this.setData({
          [`partWizardRows[${index}].photos`]: (current || []).concat(mock).slice(0, 3),
        })
        wx.showToast({ title: '已插入占位图', icon: 'none' })
      },
    })
  },

  onWizardFieldFocus(e) {
    const field = String((e.currentTarget.dataset && e.currentTarget.dataset.field) || '')
    if (!field) return
    this.setData({ wizardFocusField: field })
  },

  onWizardFieldBlur() {
    this.setData({ wizardFocusField: '' })
  },

  onWizardAddPhotos(e) {
    const index = Number(e.currentTarget.dataset.index)
    this.openWizardPhotoPicker(index)
  },

  openWizardPhotoPicker(index) {
    if (!Number.isFinite(index) || index < 0) {
      wx.showToast({ title: '配件项无效，请重试', icon: 'none' })
      return
    }
    if (this._wizardPhotoPickLock) {
      wx.showToast({ title: '正在打开相册…', icon: 'none' })
      return
    }
    const row = this.data.partWizardRows[index]
    if (!row) {
      wx.showToast({ title: '配件项不存在', icon: 'none' })
      return
    }
    if (this.data.saving || this.data.completing || this.data.switching) {
      wx.showToast({ title: '请稍候再试', icon: 'none' })
      return
    }
    const current = Array.isArray(row.photos) ? row.photos.filter(Boolean) : []
    const remain = Math.max(3 - current.length, 0)
    if (remain <= 0) {
      wx.showToast({ title: '最多上传 3 张', icon: 'none' })
      return
    }

    this._wizardPhotoPickLock = true
    let settled = false
    const unlock = () => {
      if (settled) return
      settled = true
      this._wizardPhotoPickLock = false
      if (this.data.wizardPickingIndex === index) {
        this.setData({ wizardPickingIndex: -1, wizardFocusField: '' })
      } else {
        this.setData({ wizardFocusField: '' })
      }
    }

    this.setData({
      wizardPickingIndex: index,
      wizardFocusField: '',
    })

    const inTools = this.isDevtoolsEnv()

    this.pickImages({
      count: remain,
      onSuccess: (paths) => {
        unlock()
        if (!paths.length) {
          if (inTools) {
            this.offerDevtoolsPhotoMock({ index, current, reason: '未选择图片' })
          } else {
            wx.showToast({ title: '未选择图片', icon: 'none' })
          }
          return
        }
        this.setData({
          [`partWizardRows[${index}].photos`]: current.concat(paths).slice(0, 3),
        })
      },
      onFail: (err) => {
        const msg = String((err && err.errMsg) || '')
        console.warn('[wizard-photo] pick fail', err)
        unlock()
        // 用户取消：安静退出。仅真实失败时提示；开发者工具可选用占位图。
        if (/cancel/i.test(msg)) return
        if (inTools) {
          this.offerDevtoolsPhotoMock({ index, current, reason: msg || '选图失败' })
          return
        }
        wx.showToast({ title: '无法打开相册，请检查权限', icon: 'none' })
      },
    })
  },

  onWizardRemovePhoto(e) {
    const index = Number(e.currentTarget.dataset.index)
    const photoIndex = Number(e.currentTarget.dataset.photoIndex)
    const row = this.data.partWizardRows[index]
    if (!row) return
    const photos = (row.photos || []).slice()
    photos.splice(photoIndex, 1)
    this.setData({ [`partWizardRows[${index}].photos`]: photos })
  },

  onWizardPreviewPhoto(e) {
    const index = Number(e.currentTarget.dataset.index)
    const photoIndex = Number(e.currentTarget.dataset.photoIndex)
    const row = this.data.partWizardRows[index]
    const urls = (row && row.photos) || []
    if (!urls.length) return
    wx.previewImage({ current: urls[photoIndex] || urls[0], urls })
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
    if (this.data.readOnly) {
      wx.showToast({ title: '当前为仅查看，无法识别', icon: 'none' })
      return
    }
    if (this.data.planOcrLoading) return
    try {
      const consented = await this.ensureDocumentOcrConsent()
      if (!consented) return

      // 配件节点仅开放报价单 OCR；定损/结算暂不从该入口选择
      const documentType = 'repair_quote'
      let imageUrl = this.resolveStage3QuoteImage()
      // 本地无图时仍请求后端（可用已落库的 stage_3 图兜底）
      this.setData({ planOcrLoading: true })
      wx.showLoading({ title: '识别中', mask: true })
      try {
        if (imageUrl && this.isTempImagePath(imageUrl)) {
          imageUrl = await uploadImage(imageUrl)
        }
        const payload = { documentType }
        if (imageUrl) payload.imageUrl = imageUrl
        const result = await runMerchantPlanQuoteOcr(this.albumId, payload)
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
      } finally {
        wx.hideLoading()
        this.setData({ planOcrLoading: false })
      }
    } catch (e) {
      wx.hideLoading()
      this.setData({ planOcrLoading: false })
      wx.showToast({ title: (e && e.message) || '识别失败，可手工添加', icon: 'none' })
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
      // confirmText / cancelText 最多 4 个字，超长会导致弹窗静默失败、点击无反应
      wx.showModal({
        title: '单据 OCR 说明',
        content: text,
        confirmText: '同意识别',
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
        fail: () => {
          wx.showToast({ title: '无法打开确认框，请重试', icon: 'none' })
          resolve(false)
        },
      })
    })
  },

  onToggleWizardRow(e) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({
      activeWizardIndex: this.data.activeWizardIndex === index ? -1 : index,
      wizardFocusField: '',
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

  onActivatePartVerifyTextarea() {
    this.setData({ partVerifyTextareaReady: true })
  },

  onPartVerifyGuideModeTap(e) {
    if (this.data.readOnly) return
    const mode = String((e.currentTarget.dataset && e.currentTarget.dataset.mode) || '')
    if (mode !== 'text' && mode !== 'informed') return
    this.setData({
      partVerifyGuideMode: mode,
      partVerifyGuideInformed: mode === 'informed',
      ...(mode === 'informed'
        ? { partVerifyGuideText: '', partVerifyTextareaReady: false }
        : {}),
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
    const documentEvidence = patchWarrantyFieldsInEvidence(
      (this.data.evidenceItems || []).filter((item) => !isOldPartEvidenceItem(item)),
      {
        duration: this.data.warrantyDuration,
        scope: this.data.warrantyScope,
        note: this.data.warrantyNote,
      },
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
    const ownerCheck = this.validateOwnerPhoneInput()
    // 可编辑期内始终回传手机号，支持改号/清空后再关联
    if (ownerCheck.ok) {
      normalized.userPhone = ownerCheck.phone || ''
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
        checklist: {
          items: ((this.data.checklist && this.data.checklist.items) || []).map((it) => ({
            itemKey: it.itemKey,
            note: String(it.note || '').trim(),
            outcome: it.outcome || null,
            status: it.status || undefined,
            work: {
              source: (it.work && it.work.source) || null,
              removedAs: (it.work && it.work.removedAs) || null,
              deferNote: (it.work && it.work.deferNote) || '',
            },
          })),
        },
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
    if (this.data.readOnly) {
      wx.showToast({ title: this.data.lockHint || '相册已锁定，仅可查看', icon: 'none' })
      return
    }
    if (this.data.saving) return
    if (!this.validateVehicle()) return
    // 未关联也可保存；已填则须合法，且支持随时改号（ALB-UX-15）
    const ownerCheck = this.validateOwnerPhoneInput()
    if (!ownerCheck.ok) {
      wx.showToast({ title: ownerCheck.message, icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      wx.showLoading({ title: '保存中', mask: true })
      const { payload, droppedStaleCount } = await this.buildSavePayload()
      const detail = await saveMerchantServiceAlbum(this.albumId, payload)
      wx.hideLoading()
      wx.showToast({ title: '已保存', icon: 'success' })
      this.applyAlbum(detail)
      // 保存只轻提示成功；公示/文案评估说明不在每次保存时打断（完工等路径仍可提示）
      this.notifyStaleImagesDropped(droppedStaleCount)
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  onComplete() {
    if (this.data.readOnly) {
      wx.showToast({ title: this.data.lockHint || '相册已锁定，仅可查看', icon: 'none' })
      return
    }
    if (this.data.completing || this.data.saving) return
    if (!this.validateVehicle()) return
    const ownerCheckForComplete = this.validateOwnerPhoneInput()
    if (!ownerCheckForComplete.ok) {
      wx.showToast({ title: ownerCheckForComplete.message, icon: 'none' })
      return
    }
    if (!ownerCheckForComplete.phone) {
      this.requireOwnerLinked('标记完工')
      return
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

    this.maybePromptUnresolvedWorkThenComplete()
  },

  onShareAppMessage() {
    const payload = buildOwnerShareMessage(this.data.detail)
    if (payload) return payload
    return {
      title: '辙见 · 服务相册',
      path: TOOL_HOME_PATH,
    }
  },

  onOpenCaseDraft() {
    if (!this.albumId) return
    const isResubmit = this.data.detail && this.data.detail.complianceStatus === 'rejected'
    const q = isResubmit ? `&from=complete` : ''
    wx.navigateTo({
      url: `/packageMerchant/pages/album/case-draft/index?albumId=${this.albumId}${q}`,
    })
  },

  async onCopyCaseDraftExport() {
    if (!this.albumId) return
    try {
      wx.showLoading({ title: '准备文案', mask: true })
      const data = await exportMerchantCaseDraftCopy(this.albumId)
      wx.hideLoading()
      const text = (data && data.text) || ''
      if (!text) {
        wx.showToast({ title: '暂无可复制文案', icon: 'none' })
        return
      }
      await wx.setClipboardData({ data: text })
      wx.showToast({ title: '已复制，可发自媒体', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '复制失败', icon: 'none' })
    }
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
