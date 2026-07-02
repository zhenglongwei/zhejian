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
  formatPlanAmountLabel,
} = require('../../../../utils/album-price')
const {
  fetchMerchantServiceAlbum,
  saveMerchantServiceAlbum,
  completeMerchantServiceAlbum,
  switchMerchantServiceAlbumTemplate,
  recognizeVehicleIntakeOcr,
} = require('../../../../services/merchant-service-album')
const { fetchServiceAlbumTemplateOptions } = require('../../../../services/service-album-template')
const {
  canShareToOwner,
  buildOwnerShareMessage,
} = require('../../../../utils/service-album-share')
const { TOOL_HOME_PATH } = require('../../../../utils/share-store-context')
const { resolveMerchantAlbumDisplayStatus } = require('../../../../utils/service-album-display')
const { persistAlbumNodeImages, persistLocalImages, normalizeStoredImageUrl, uploadImage } = require('../../../../utils/media-upload')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')

const { ALLOW_TEST_OWNER_PHONE } = require('../../../../services/config')
const {
  resolveCompareColumnsFromNodes,
  buildComparePairPreview,
  syncBeforeFromAssessment,
  applyCompareColumnsToNodes,
} = require('../../../../utils/album-compare-stage-images')
const {
  buildPartWizardRows,
  mergeWizardRowIntoParts,
  appendExtraPart,
} = require('../../../../utils/album-part-wizard')
const {
  saveMerchantPlanPartsDraft,
  lockMerchantPlanParts,
  unlockMerchantPlanParts,
  runMerchantPlanQuoteOcr,
  recognizePartLabelOcr,
} = require('../../../../services/merchant-plan-parts')

const PART_TYPE_LIST = Object.values(PART_TYPE)
const BODY_PAINT_TEMPLATE_ID = 'body_paint'
const STAGE_COMPARE_ID = 'stage_5'
const STAGE_ASSESSMENT_ID = 'stage_2'
const STAGE_PLAN_ID = 'stage_3'
const STAGE_PARTS_ID = 'stage_4'

function normalizeOwnerPhone(value) {
  return String(value || '').replace(/\D/g, '')
}

const OWNER_PHONE_HINT = ALLOW_TEST_OWNER_PHONE
  ? '【测试模式】可手填车主手机号；标记完工前须关联车主。正式环境须由车主扫码确认。'
  : '标记已完工前，须由车主扫码关联本人手机号（商家不可代填）。关联后车主可在小程序查看维修进度。'

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    detail: null,
    summaryRows: [],
    statusLabel: '',
    statusVariant: 'info',
    stages: SERVICE_ALBUM_STAGES,
    stageTabs: SERVICE_ALBUM_STAGES.map((s) => ({ key: s.id, label: s.title })),
    stageIndex: 0,
    nodes: [],
    parts: [],
    planAmount: '',
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
    vehicleOcrLoading: false,
    isCompleted: false,
    hasOwner: false,
    publicCaseStatus: 'private',
    showBottomPrimary: false,
    bottomPrimaryText: '',
    ownerPhoneHint: OWNER_PHONE_HINT,
    allowTestOwnerPhone: ALLOW_TEST_OWNER_PHONE,
    ownerPhoneInput: '',
    uploadPrivacyHint:
      '原图供服务相册与车主查看；公开须车主授权并脱敏。请勿上传车牌、手机号、证件等敏感信息。',
    templateOptions: [],
    templatePickerIndex: 0,
    templateId: '',
    templateName: '',
    canSwitchTemplate: false,
    switching: false,
    completeness: null,
    geoEvidence: null,
    geoEvidenceVariant: 'default',
    geoEvidenceLabel: '',
    compareBeforeImages: [],
    compareAfterImages: [],
    comparePairPreview: [],
    isComparePairStage: false,
    planParts: [],
    planPartsLocked: false,
    planOcrLoading: false,
    planPartsSaving: false,
    planPartsLocking: false,
    amountMismatch: false,
    amountMismatchHint: '',
    planParseHint: '',
    partWizardRows: [],
    partWizardExtras: [],
    partWizardProgress: '',
    activeWizardIndex: -1,
    partLabelOcrLoading: false,
    showExtraPartForm: false,
    extraPartForm: {
      partName: '',
      partBrand: '',
      partCode: '',
      partTypeIndex: 0,
      extraReason: '',
    },
  },

  onLoad(options) {
    this.albumId = options.albumId || ''
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '服务相册信息缺失' })
      return
    }
    this.initPage()
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
      const apiTitle = String(node.title || '').trim()
      return {
        id: stage.id,
        title: apiTitle || stage.title,
        description: mergedMeta.description,
        photoTips: mergedMeta.photoTips,
        compareGuidance: mergedMeta.compareGuidance,
        requiredLevelLabel: mergedMeta.requiredLevelLabel || '',
        requiredLevelVariant: mergedMeta.requiredLevelVariant || 'default',
        notePlaceholder: meta.notePlaceholder || stage.notePlaceholder || '补充本节点说明',
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
    const isComparePairStage =
      this.data.templateId === BODY_PAINT_TEMPLATE_ID &&
      SERVICE_ALBUM_STAGES[stageIndex] &&
      SERVICE_ALBUM_STAGES[stageIndex].id === STAGE_COMPARE_ID
    this.setData({ isComparePairStage })
    return isComparePairStage
  },

  initCompareColumnsFromNodes(nodes, templateId) {
    if (templateId !== BODY_PAINT_TEMPLATE_ID) {
      return {
        beforeImages: [],
        afterImages: [],
        pairPreview: [],
      }
    }
    const { beforeImages, afterImages } = resolveCompareColumnsFromNodes(nodes)
    return {
      beforeImages,
      afterImages,
      pairPreview: buildComparePairPreview(beforeImages, afterImages),
    }
  },

  applyCompareColumnsToPage(beforeImages, afterImages) {
    const normalize = (list) =>
      (list || []).map((url) => String(url || '').trim()).filter(Boolean)
    const before = normalize(beforeImages)
    const after = normalize(afterImages)
    const assessment = this.resolveAssessmentImages()
    const nodes = applyCompareColumnsToNodes(this.data.nodes, before, after, assessment)
    this.setData({
      compareBeforeImages: before,
      compareAfterImages: after,
      comparePairPreview: buildComparePairPreview(before, after),
      nodes,
    })
  },

  applyAlbum(detail) {
    const nodes = this.mergeNodes(detail.nodes, detail.templateId)
    const stageTabs = this.buildStageTabs(nodes)
    const planAmount = resolvePlanAmount(detail)
    const imageCount = detail.imageCount != null ? detail.imageCount : 0
    const canShare = canShareToOwner(detail)
    const isCompleted =
      detail.status === SERVICE_ALBUM_STATUS.COMPLETED ||
      detail.status === SERVICE_ALBUM_STATUS.PUBLISHED
    const summaryRows = [
      { label: '车型', value: detail.vehicleDisplay || '—' },
      { label: '车主', value: detail.userPhoneDisplay || '未关联' },
      { label: '过程图', value: `${imageCount} 张` },
    ]
    if (planAmount != null) {
      summaryRows.splice(2, 0, {
        label: '方案报价',
        value: formatPlanAmountLabel(planAmount),
      })
    }
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
    const compareColumns = this.initCompareColumnsFromNodes(nodes, detail.templateId || '')
    const geoEvidence =
      detail.completeness && detail.completeness.geoEvidence
        ? detail.completeness.geoEvidence
        : null
    let geoEvidenceVariant = 'default'
    let geoEvidenceLabel = ''
    if (geoEvidence) {
      if (geoEvidence.level === 'block') {
        geoEvidenceVariant = 'warning'
        geoEvidenceLabel = '公开证据待补'
      } else if (geoEvidence.level === 'weak') {
        geoEvidenceVariant = 'info'
        geoEvidenceLabel = '可优化'
      } else {
        geoEvidenceVariant = 'success'
        geoEvidenceLabel = '证据齐全'
      }
    }
    this.setData({
      status: 'normal',
      detail,
      summaryRows,
      statusLabel: display.statusLabel,
      statusVariant: display.statusVariant,
      stageTabs,
      nodes,
      compareBeforeImages: compareColumns.beforeImages,
      compareAfterImages: compareColumns.afterImages,
      comparePairPreview: compareColumns.pairPreview,
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
      showBottomPrimary,
      bottomPrimaryText,
      templateId: detail.templateId || '',
      templateName: detail.templateName || '',
      templatePickerIndex: this.syncTemplatePickerIndex(detail.templateId),
      canSwitchTemplate,
      completeness: detail.completeness || null,
      geoEvidence,
      geoEvidenceVariant,
      geoEvidenceLabel,
      planParts: detail.planParts || [],
      planPartsLocked: Boolean(detail.planPartsLocked),
      amountMismatch: Boolean(detail.amountMismatch),
      amountMismatchHint: detail.amountMismatchHint || '',
      ownerPhoneInput: hasOwnerPhone ? '' : this.data.ownerPhoneInput,
    }, () => {
      this.refreshCompareStageFlags(this.data.stageIndex)
      this.refreshPartWizard()
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
        if (isCompare && this.data.templateId === BODY_PAINT_TEMPLATE_ID) {
          const cols = this.initCompareColumnsFromNodes(this.data.nodes, this.data.templateId)
          this.setData({
            compareBeforeImages: cols.beforeImages,
            compareAfterImages: cols.afterImages,
            comparePairPreview: cols.pairPreview,
          })
        }
      })
    }
  },

  onCompareColumnsChange(e) {
    const beforeImages = (e.detail && e.detail.beforeImages) || []
    const afterImages = (e.detail && e.detail.afterImages) || []
    this.applyCompareColumnsToPage(beforeImages, afterImages)
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
    const { beforeImages, afterImages } = syncBeforeFromAssessment(
      this.data.compareBeforeImages,
      this.data.compareAfterImages,
      assessment,
    )
    this.applyCompareColumnsToPage(beforeImages, afterImages)
    wx.showToast({ title: '已同步修复前照片', icon: 'success' })
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
      this.data.templateId === BODY_PAINT_TEMPLATE_ID &&
      nodes[index].id === STAGE_ASSESSMENT_ID
    ) {
      const assessment = nodes[index].images || []
      const synced = syncBeforeFromAssessment(
        this.data.compareBeforeImages,
        this.data.compareAfterImages,
        assessment,
      )
      updates.compareBeforeImages = synced.beforeImages
      updates.compareAfterImages = synced.afterImages
      updates.comparePairPreview = buildComparePairPreview(
        synced.beforeImages,
        synced.afterImages,
      )
      updates.nodes = applyCompareColumnsToNodes(
        nodes,
        synced.beforeImages,
        synced.afterImages,
        assessment,
      )
    }

    this.setData(updates)
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
    const plate = String(this.data.vehiclePlate || '')
      .trim()
      .replace(/[\s·.]/g, '')
      .toUpperCase()
    const vin = String(this.data.vehicleVin || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
    const payload = {
      brand: (this.data.vehicleBrand || '').trim(),
      series: (this.data.vehicleSeries || '').trim(),
    }
    if (plate) payload.plate = plate
    if (vin) payload.vin = vin
    return payload
  },

  resolveIntakeImageUrl() {
    const intakeNode = (this.data.nodes || [])[0]
    const images = (intakeNode && intakeNode.images) || []
    for (let i = images.length - 1; i >= 0; i -= 1) {
      const url = normalizeStoredImageUrl(images[i])
      if (url) return url
    }
    return ''
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

  applyVehicleOcrResult(result = {}) {
    const patch = {}
    const { vehicleBrand, vehicleSeries, vehiclePlate, vehicleVin } = this.data
    const hasExisting = Boolean(
      (vehiclePlate || '').trim() || (vehicleVin || '').trim()
    )

    const applyFields = (overwrite) => {
      const next = {}
      if (result.plate && (overwrite || !vehiclePlate)) {
        next.vehiclePlate = result.plate
      }
      if (result.vin && (overwrite || !vehicleVin)) {
        next.vehicleVin = result.vin
      }
      if (Object.keys(next).length) {
        this.setData(next)
        wx.showToast({ title: '已识别，请核对', icon: 'none' })
      } else if (result.plate || result.vin) {
        wx.showToast({ title: '字段已填写，未覆盖', icon: 'none' })
      }
    }

    if (!hasExisting) {
      applyFields(false)
      return
    }

    wx.showModal({
      title: '识别到车辆信息',
      content: '是否用识别结果覆盖当前已填写的车牌或 VIN？',
      confirmText: '覆盖',
      success: (res) => {
        if (!res.confirm) return
        applyFields(true)
      },
    })
  },

  async onVehicleOcrFromIntake() {
    if (this.data.vehicleOcrLoading || this.data.saving || this.data.completing) return

    let imageUrl = this.resolveIntakeImageUrl()
    if (!imageUrl) {
      wx.showToast({ title: '请先在接车节点上传照片', icon: 'none' })
      return
    }

    this.setData({ vehicleOcrLoading: true })
    wx.showLoading({ title: '识别中', mask: true })
    try {
      if (this.isTempImagePath(imageUrl)) {
        imageUrl = await uploadImage(imageUrl)
        const nodes = this.data.nodes.slice()
        if (nodes[0] && Array.isArray(nodes[0].images) && nodes[0].images.length) {
          const images = nodes[0].images.slice()
          images[images.length - 1] = imageUrl
          nodes[0] = { ...nodes[0], images }
          this.setData({ nodes })
        }
      }
      const result = await recognizeVehicleIntakeOcr(imageUrl)
      this.applyVehicleOcrResult(result)
    } catch (e) {
      wx.showToast({
        title: (e && e.message) || '识别失败，请手动填写',
        icon: 'none',
      })
    } finally {
      wx.hideLoading()
      this.setData({ vehicleOcrLoading: false })
    }
  },

  refreshPartWizard() {
    const wizard = buildPartWizardRows(this.data.planParts, this.data.parts)
    this.setData({
      partWizardRows: wizard.rows,
      partWizardExtras: wizard.extras,
      partWizardProgress: wizard.progressLabel,
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

  onPlanPartInput(e) {
    const { index, field } = e.currentTarget.dataset
    const key = `planParts[${index}].${field}`
    this.setData({ [key]: e.detail.value })
  },

  onPlanPartTypeChange(e) {
    const index = Number(e.currentTarget.dataset.index)
    const partType = PART_TYPE_LIST[Number(e.detail.value)] || PART_TYPE.OEM
    this.setData({ [`planParts[${index}].partType`]: partType })
  },

  onAddPlanPartRow() {
    const next = (this.data.planParts || []).concat([
      {
        planPartId: `plan_${Date.now()}`,
        name: '',
        partType: PART_TYPE.BRAND,
        partBrand: '',
        partCode: '',
        qty: 1,
        status: 'draft',
      },
    ])
    this.setData({ planParts: next })
  },

  onRemovePlanPartRow(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (Number.isNaN(index)) return
    const next = (this.data.planParts || []).slice()
    next.splice(index, 1)
    this.setData({ planParts: next })
  },

  async onRunPlanQuoteOcr() {
    if (this.data.planOcrLoading || this.data.planPartsLocked) return
    let imageUrl = this.resolveStage3QuoteImage()
    if (!imageUrl) {
      wx.showToast({ title: '请先在上方上传报价表图片', icon: 'none' })
      return
    }
    this.setData({ planOcrLoading: true })
    wx.showLoading({ title: '识别中', mask: true })
    try {
      if (this.isTempImagePath(imageUrl)) {
        imageUrl = await uploadImage(imageUrl)
      }
      const result = await runMerchantPlanQuoteOcr(this.albumId, { imageUrl })
      this.setData({
        planParts: result.planParts || [],
        amountMismatch: Boolean(result.amountMismatch),
        amountMismatchHint: result.amountMismatchHint || '',
        planParseHint: result.parseHint || '',
      })
      wx.showToast({
        title: '已智能解析，请核对',
        icon: 'none',
      })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '识别失败，可手工录入', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ planOcrLoading: false })
    }
  },

  async onSavePlanPartsDraft() {
    if (this.data.planPartsSaving || this.data.planPartsLocked) return
    this.setData({ planPartsSaving: true })
    try {
      wx.showLoading({ title: '保存中', mask: true })
      const result = await saveMerchantPlanPartsDraft(this.albumId, {
        planParts: this.data.planParts,
      })
      wx.hideLoading()
      this.setData({
        planParts: result.planParts || [],
        amountMismatch: Boolean(result.amountMismatch),
        amountMismatchHint: result.amountMismatchHint || '',
      })
      wx.showToast({ title: '目录已保存', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ planPartsSaving: false })
    }
  },

  async onLockPlanParts() {
    if (this.data.planPartsLocking || this.data.planPartsLocked) return
    this.setData({ planPartsLocking: true })
    try {
      wx.showLoading({ title: '锁定中', mask: true })
      await saveMerchantPlanPartsDraft(this.albumId, {
        planParts: this.data.planParts,
      })
      const result = await lockMerchantPlanParts(this.albumId)
      wx.hideLoading()
      this.setData({
        planParts: result.planParts || [],
        planPartsLocked: Boolean(result.planPartsLocked),
        amountMismatch: Boolean(result.amountMismatch),
        amountMismatchHint: result.amountMismatchHint || '',
      }, () => this.refreshPartWizard())
      wx.showToast({ title: '方案目录已锁定', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '锁定失败', icon: 'none' })
    } finally {
      this.setData({ planPartsLocking: false })
    }
  },

  async onUnlockPlanParts() {
    if (!this.data.planPartsLocked) return
    wx.showModal({
      title: '解锁方案目录',
      content: '解锁后可修改方案配件目录，阶段四清单向导将暂停更新。',
      success: async (res) => {
        if (!res.confirm) return
        try {
          wx.showLoading({ title: '解锁中', mask: true })
          const result = await unlockMerchantPlanParts(this.albumId)
          wx.hideLoading()
          this.setData({
            planParts: result.planParts || [],
            planPartsLocked: Boolean(result.planPartsLocked),
          })
          wx.showToast({ title: '已解锁', icon: 'success' })
        } catch (e) {
          wx.hideLoading()
          wx.showToast({ title: (e && e.message) || '解锁失败', icon: 'none' })
        }
      },
    })
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
    const partType = PART_TYPE_LIST[Number(e.detail.value)] || PART_TYPE.OEM
    this.setData({
      [`partWizardRows[${index}].partType`]: partType,
      [`partWizardRows[${index}].partTypeIndex`]: Number(e.detail.value),
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
    let imageUrl = (row.photos && row.photos[0]) || ''
    if (!imageUrl) {
      wx.showToast({ title: '请先上传凭证图', icon: 'none' })
      return
    }
    this.setData({ partLabelOcrLoading: true })
    try {
      if (this.isTempImagePath(imageUrl)) {
        imageUrl = await uploadImage(imageUrl)
        this.setData({ [`partWizardRows[${index}].photos`]: [imageUrl] })
      }
      const result = await recognizePartLabelOcr(this.albumId, imageUrl)
      const patch = {}
      if (result.partCode) patch[`partWizardRows[${index}].partCode`] = result.partCode
      if (result.partBrand) patch[`partWizardRows[${index}].partBrand`] = result.partBrand
      this.setData(patch)
      wx.showToast({ title: '已识别，请核对', icon: 'none' })
    } catch (err) {
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
    let photos = row.photos || []
    const uploaded = await persistLocalImages(photos)
    photos = uploaded.images
    const mergedRow = { ...row, photos }
    const parts = mergeWizardRowIntoParts(this.data.parts, mergedRow).map((p) => ({
      ...p,
      typeVariant: PART_TYPE_VARIANT[p.partType] || 'default',
    }))
    this.setData({ parts }, () => this.refreshPartWizard())
    wx.showToast({ title: '已保存本项', icon: 'success' })
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

  async buildSavePayload() {
    let nodesSource = this.data.nodes
    if (
      this.data.templateId === BODY_PAINT_TEMPLATE_ID &&
      (this.data.compareBeforeImages.length || this.data.compareAfterImages.length)
    ) {
      nodesSource = applyCompareColumnsToNodes(
        nodesSource,
        this.data.compareBeforeImages,
        this.data.compareAfterImages,
        this.resolveAssessmentImages(),
      )
    }
    const { nodes, droppedStaleCount } = await persistAlbumNodeImages(
      nodesSource.map((n) => ({
        id: n.id,
        title: n.title,
        status: (n.images && n.images.length) || n.note ? 'completed' : 'pending',
        images: n.images || [],
        note: n.note || '',
        updatedAt: new Date().toISOString(),
      }))
    )
    const normalized = normalizePlanAmountPayload({
      nodes,
      parts: this.data.parts,
      planAmount: this.data.planAmount,
      vehicle: this.buildVehiclePayload(),
    })
    if (this.data.allowTestOwnerPhone && !this.data.hasOwner) {
      const ownerCheck = this.validateOwnerPhoneInput()
      if (ownerCheck.phone) {
        normalized.userPhone = ownerCheck.phone
      }
    }
    return { payload: normalized, droppedStaleCount }
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

  async onSave() {
    if (this.data.saving) return
    if (!this.validateVehicle()) return
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
    const hasImage = this.data.nodes.some((n) => (n.images || []).length > 0)
    if (!hasImage) {
      wx.showToast({ title: '请至少上传一张过程图', icon: 'none' })
      return
    }

    wx.showModal({
      title: '标记已完工',
      content:
        '完工后服务相册将保存完整记录。车主可在小程序查看；公开案例须车主另行授权公示。',
      confirmText: '确认完工',
      success: (res) => {
        if (!res.confirm) return
        setTimeout(() => this.submitComplete(), 200)
      },
    })
  },

  async submitComplete() {
    if (this.data.completing) return
    this.setData({ completing: true })
    try {
      wx.showLoading({ title: '提交中', mask: true })
      const { payload, droppedStaleCount } = await this.buildSavePayload()
      await saveMerchantServiceAlbum(this.albumId, payload)
      await completeMerchantServiceAlbum(this.albumId)
      wx.hideLoading()
      wx.showToast({ title: '已标记完工', icon: 'success', duration: 1500 })
      if (droppedStaleCount > 0) {
        this.notifyStaleImagesDropped(droppedStaleCount)
      }
      const detail = await fetchMerchantServiceAlbum(this.albumId)
      this.applyAlbum(detail)
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

  onInviteOwnerScan() {
    if (!this.albumId) return
    wx.navigateTo({
      url: `/packageMerchant/pages/album/invite/index?albumId=${this.albumId}`,
    })
  },
})
