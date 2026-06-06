const { SERVICE_ALBUM_STAGES, getStageMeta } = require('../../../../constants/service-album-stages')
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
  createMerchantColdStartPreview,
} = require('../../../../services/merchant-service-album')
const {
  canShareToOwner,
  buildOwnerShareMessage,
} = require('../../../../utils/service-album-share')
const { resolveMerchantAlbumDisplayStatus } = require('../../../../utils/service-album-display')
const { persistAlbumNodeImages, normalizeStoredImageUrl } = require('../../../../utils/media-upload')
const { BIZ_TYPE } = require('../../../../constants/desensitize')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')

const PART_TYPE_LIST = Object.values(PART_TYPE)

const OWNER_PHONE_HINT =
  '填写手机号后，用户可在小程序端查看相册并实时跟踪维修进度。如果没有手机号，公示时仅展示车型和故障修复信息，不展示门店信息。完工后仍可修改手机号，便于纠正录入错误。'

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
    storeNote: '',
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
    ownerPhoneInput: '',
    isCompleted: false,
    savingOwnerPhone: false,
    hasOwner: false,
    showSubmitReviewButton: false,
    publicCaseStatus: 'private',
    submitReviewLoading: false,
    showBottomPrimary: false,
    bottomPrimaryText: '',
    ownerPhoneHint: OWNER_PHONE_HINT,
    uploadPrivacyHint:
      '原图供服务相册与车主查看；公开须车主授权并脱敏。请勿上传车牌、手机号、证件等敏感信息。',
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
    this.loadAlbum()
  },

  mergeNodes(rawNodes) {
    const map = {}
    ;(rawNodes || []).forEach((n) => {
      map[n.id] = n
    })
    return SERVICE_ALBUM_STAGES.map((stage) => {
      const node = map[stage.id] || {}
      const meta = getStageMeta(stage.id) || stage
      return {
        id: stage.id,
        title: stage.title,
        description: meta.description,
        photoTips: meta.photoTips,
        requiredLevelLabel: meta.requiredLevelLabel,
        requiredLevelVariant: meta.requiredLevelVariant,
        images: (node.images || []).map(normalizeStoredImageUrl).filter(Boolean),
        note: node.note || '',
      }
    })
  },

  applyAlbum(detail) {
    const nodes = this.mergeNodes(detail.nodes)
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
    const showSubmitReviewButton =
      isCompleted && !hasOwnerPhone && publicCaseStatus === 'private'
    let showBottomPrimary = false
    let bottomPrimaryText = ''
    if (
      detail.status !== SERVICE_ALBUM_STATUS.COMPLETED &&
      detail.status !== SERVICE_ALBUM_STATUS.PUBLISHED
    ) {
      showBottomPrimary = true
      bottomPrimaryText = '标记已完工'
    } else if (showSubmitReviewButton) {
      showBottomPrimary = true
      bottomPrimaryText = '提交审核'
    }
    this.setData({
      status: 'normal',
      detail,
      summaryRows,
      statusLabel: display.statusLabel,
      statusVariant: display.statusVariant,
      nodes,
      parts: (detail.parts || []).map((p) => ({
        ...p,
        typeVariant: PART_TYPE_VARIANT[p.partType] || 'default',
      })),
      storeNote: detail.storeNote || '',
      planAmount: planAmount != null ? String(planAmount) : '',
      pricePreview: {
        mode: PRICE_MODE.FIXED,
        amount: planAmount,
      },
      canShareToOwner: canShare,
      ownerPhoneInput: detail.userPhone || '',
      isCompleted,
      hasOwner,
      publicCaseStatus,
      showSubmitReviewButton,
      showBottomPrimary,
      bottomPrimaryText,
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
    if (index >= 0) this.setData({ stageIndex: index })
  },

  onNodeImages(e) {
    let index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) {
      index = this.data.stageIndex
    }
    if (!Number.isFinite(index)) return
    const nodes = this.data.nodes.slice()
    nodes[index].images = (e.detail && e.detail.images) || []
    this.setData({ nodes })
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

  onStoreNoteInput(e) {
    this.setData({ storeNote: e.detail.value })
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
    const { nodes, droppedStaleCount } = await persistAlbumNodeImages(
      this.data.nodes.map((n) => ({
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
      storeNote: this.data.storeNote,
      planAmount: this.data.planAmount,
    })
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
    const hasImage = this.data.nodes.some((n) => (n.images || []).length > 0)
    if (!hasImage) {
      wx.showToast({ title: '请至少上传一张过程图', icon: 'none' })
      return
    }

    wx.showModal({
      title: '标记已完工',
      content: this.data.hasOwner
        ? '完工后服务相册将保存完整记录。若已关联车主，对方可查看；公开案例须车主另行授权。'
        : '完工后服务相册将保存完整记录。未关联车主时，可在底部提交审核。',
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
      path: '/pages/index/index',
    }
  },

  onOwnerPhoneInput(e) {
    const ownerPhoneInput = e.detail.value || ''
    const savedPhone = String((this.data.detail && this.data.detail.userPhone) || '').trim()
    const draftPhone = String(ownerPhoneInput).trim()
    const hasOwnerPhone = Boolean(savedPhone) || /^1\d{10}$/.test(draftPhone)
    const showSubmitReviewButton =
      this.data.isCompleted &&
      !hasOwnerPhone &&
      this.data.publicCaseStatus === 'private'
    let showBottomPrimary = false
    let bottomPrimaryText = ''
    if (
      this.data.detail &&
      this.data.detail.status !== SERVICE_ALBUM_STATUS.COMPLETED &&
      this.data.detail.status !== SERVICE_ALBUM_STATUS.PUBLISHED
    ) {
      showBottomPrimary = true
      bottomPrimaryText = '标记已完工'
    } else if (showSubmitReviewButton) {
      showBottomPrimary = true
      bottomPrimaryText = '提交审核'
    }
    this.setData({
      ownerPhoneInput,
      showSubmitReviewButton,
      showBottomPrimary,
      bottomPrimaryText,
    })
  },

  onInviteOwnerScan() {
    if (!this.albumId) return
    wx.navigateTo({
      url: `/packageMerchant/pages/album/invite/index?albumId=${this.albumId}`,
    })
  },

  async onSaveOwnerPhone() {
    if (this.data.savingOwnerPhone) return
    const userPhone = (this.data.ownerPhoneInput || '').trim()
    if (!/^1\d{10}$/.test(userPhone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }
    const previous = (this.data.detail && this.data.detail.userPhone) || ''
    if (userPhone === previous) {
      wx.showToast({ title: '手机号未变更', icon: 'none' })
      return
    }
    this.setData({ savingOwnerPhone: true })
    try {
      wx.showLoading({ title: '保存中', mask: true })
      const { payload, droppedStaleCount } = await this.buildSavePayload()
      const detail = await saveMerchantServiceAlbum(this.albumId, {
        ...payload,
        userPhone,
      })
      wx.hideLoading()
      wx.showToast({ title: '手机号已保存', icon: 'success' })
      this.applyAlbum(detail)
      this.notifyStaleImagesDropped(droppedStaleCount)
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ savingOwnerPhone: false })
    }
  },

  canComplete() {
    const status = this.data.detail && this.data.detail.status
    return status !== SERVICE_ALBUM_STATUS.COMPLETED && status !== SERVICE_ALBUM_STATUS.PUBLISHED
  },

  hasAlbumImages() {
    const imageCount = this.data.detail && this.data.detail.imageCount
    if (Number.isFinite(imageCount) && imageCount > 0) return true
    return (this.data.nodes || []).some((n) => (n.images || []).length > 0)
  },

  onSubmitReview() {
    if (this.data.submitReviewLoading) {
      wx.showToast({ title: '正在提交，请稍候', icon: 'none' })
      return
    }
    if (this.data.saving) {
      wx.showToast({ title: '正在保存，请稍候', icon: 'none' })
      return
    }
    if (this.data.completing) {
      wx.showToast({ title: '正在标记完工，请稍候', icon: 'none' })
      return
    }
    if (!this.data.isCompleted) {
      wx.showToast({ title: '请先标记已完工', icon: 'none' })
      return
    }
    const savedPhone = String((this.data.detail && this.data.detail.userPhone) || '').trim()
    const draftPhone = String(this.data.ownerPhoneInput || '').trim()
    if (draftPhone && draftPhone !== savedPhone) {
      wx.showToast({ title: '请先保存或清空手机号', icon: 'none' })
      return
    }
    if (savedPhone) {
      wx.showToast({ title: '已关联车主，请由车主完成授权公示', icon: 'none' })
      return
    }
    if (this.data.publicCaseStatus === 'pending_review') {
      wx.showToast({ title: '已在审核中', icon: 'none' })
      return
    }
    if (this.data.publicCaseStatus === 'public_approved') {
      wx.showToast({ title: '该案例已公开展示', icon: 'none' })
      return
    }
    if (!this.hasAlbumImages()) {
      wx.showToast({ title: '请至少上传一张过程图', icon: 'none' })
      return
    }

    wx.hideLoading()
    wx.showModal({
      title: '提交审核',
      content:
        '请逐张核对脱敏效果并确认责任声明。审核通过后，案例将展示在公开页，价格为系统参考区间。',
      confirmText: '开始核对',
      success: (res) => {
        if (!res.confirm) return
        this.openColdStartWorkbench()
      },
      fail: () => {
        wx.showToast({ title: '无法打开确认框', icon: 'none' })
      },
    })
  },

  async openColdStartWorkbench() {
    if (this.data.submitReviewLoading) return
    this.setData({ submitReviewLoading: true })
    try {
      wx.showLoading({ title: '加载脱敏预览', mask: true })
      const preview = await createMerchantColdStartPreview(this.albumId)
      wx.hideLoading()
      const taskId = preview.taskId || (preview.task && preview.task.taskId)
      if (!taskId) {
        wx.showToast({ title: '脱敏任务创建失败', icon: 'none' })
        return
      }
      wx.navigateTo({
        url:
          `/packageMerchant/pages/desensitize/workbench/index?taskId=${encodeURIComponent(taskId)}` +
          `&albumId=${encodeURIComponent(this.albumId)}` +
          `&bizType=${BIZ_TYPE.MERCHANT_HISTORY}&from=album_edit&fromPreMask=1`,
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    } finally {
      this.setData({ submitReviewLoading: false })
    }
  },
})
