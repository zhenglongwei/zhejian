const { SERVICE_ALBUM_STAGES, getStageMeta } = require('../../../../constants/service-album-stages')
const {
  SERVICE_ALBUM_STATUS,
  SERVICE_ALBUM_STATUS_LABEL,
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
} = require('../../../../services/merchant-service-album')
const {
  canShareToOwner,
  buildOwnerShareMessage,
} = require('../../../../utils/service-album-share')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')

const PART_TYPE_LIST = Object.values(PART_TYPE)

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    detail: null,
    summaryRows: [],
    statusLabel: '',
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
    savingOwnerPhone: false,
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
        images: node.images || [],
        note: node.note || '',
      }
    })
  },

  applyAlbum(detail) {
    const nodes = this.mergeNodes(detail.nodes)
    const planAmount = resolvePlanAmount(detail)
    const imageCount = detail.imageCount != null ? detail.imageCount : 0
    const summaryRows = [
      { label: '车型', value: detail.vehicleDisplay || '—' },
      { label: '车主', value: detail.userPhoneDisplay || '未关联' },
      { label: '过程图', value: `${imageCount} 张` },
    ]
    if (planAmount != null) {
      summaryRows.splice(2, 0, {
        label: '参考报价',
        value: formatPlanAmountLabel(planAmount),
      })
    }
    this.setData({
      status: 'normal',
      detail,
      summaryRows,
      statusLabel: SERVICE_ALBUM_STATUS_LABEL[detail.status] || detail.status,
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
      canShareToOwner: canShareToOwner(detail),
      ownerPhoneInput: detail.userPhone || '',
    })
    this.syncShareMenu(canShareToOwner(detail))
  },

  syncShareMenu(enabled) {
    if (enabled) {
      wx.showShareMenu({ withShareTicket: false, menus: ['shareAppMessage'] })
    } else {
      wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    }
  },

  async loadAlbum() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const detail = await fetchMerchantServiceAlbum(this.albumId)
      this.applyAlbum(detail)
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
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
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) return
    const nodes = this.data.nodes.slice()
    nodes[index].images = (e.detail && e.detail.images) || []
    this.setData({ nodes })
  },

  onNodeNoteChange(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) return
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

  buildSavePayload() {
    const normalized = normalizePlanAmountPayload({
      nodes: this.data.nodes.map((n) => ({
        id: n.id,
        title: n.title,
        status: (n.images && n.images.length) || n.note ? 'completed' : 'pending',
        images: n.images || [],
        note: n.note || '',
        updatedAt: new Date().toISOString(),
      })),
      parts: this.data.parts,
      storeNote: this.data.storeNote,
      planAmount: this.data.planAmount,
    })
    return normalized
  },

  async onSave() {
    if (this.data.saving) return
    this.setData({ saving: true })
    try {
      wx.showLoading({ title: '保存中', mask: true })
      const detail = await saveMerchantServiceAlbum(this.albumId, this.buildSavePayload())
      wx.hideLoading()
      wx.showToast({ title: '已保存', icon: 'success' })
      this.applyAlbum(detail)
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  async onComplete() {
    if (this.data.completing || this.data.saving) return
    const hasImage = this.data.nodes.some((n) => (n.images || []).length > 0)
    if (!hasImage) {
      wx.showToast({ title: '请至少上传一张过程图', icon: 'none' })
      return
    }

    wx.showModal({
      title: '标记已完工',
      content:
        '完工后服务相册将保存完整记录。若已关联车主，对方可查看；公开案例须车主另行授权。',
      confirmText: '确认完工',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ completing: true })
        try {
          wx.showLoading({ title: '提交中', mask: true })
          await saveMerchantServiceAlbum(this.albumId, this.buildSavePayload())
          const detail = await completeMerchantServiceAlbum(this.albumId)
          wx.hideLoading()
          wx.showToast({ title: '已标记完工', icon: 'success' })
          this.applyAlbum(detail)
        } catch (e) {
          wx.hideLoading()
          wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
        } finally {
          this.setData({ completing: false })
        }
      },
    })
  },

  onShareAppMessage() {
    const payload = buildOwnerShareMessage(this.data.detail)
    if (!payload) {
      wx.showToast({ title: '请先填写车主手机号', icon: 'none' })
      return {
        title: '辙见',
        path: '/pages/index/index',
      }
    }
    return payload
  },

  onOwnerPhoneInput(e) {
    this.setData({ ownerPhoneInput: e.detail.value })
  },

  async onSaveOwnerPhone() {
    if (this.data.savingOwnerPhone) return
    const userPhone = (this.data.ownerPhoneInput || '').trim()
    if (!/^1\d{10}$/.test(userPhone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }
    this.setData({ savingOwnerPhone: true })
    try {
      wx.showLoading({ title: '保存中', mask: true })
      const detail = await saveMerchantServiceAlbum(this.albumId, {
        ...this.buildSavePayload(),
        userPhone,
      })
      wx.hideLoading()
      wx.showToast({ title: '手机号已保存', icon: 'success' })
      this.applyAlbum(detail)
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
})
