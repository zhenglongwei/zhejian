const { TEMPLATE_LIST, ALBUM_TEMPLATES } = require('../../../../constants/album')
const { PRICE_MODE } = require('../../../../constants/price-mode')
const { saveAlbum } = require('../../../../services/album')
const { createTask } = require('../../../../services/desensitize')
const { BIZ_TYPE } = require('../../../../constants/desensitize')
const { normalizeVehicleText } = require('../../../../utils/album-card')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')

Page({
  data: {
    templates: TEMPLATE_LIST,
    templateIndex: 0,
    form: {
      vehicleText: '',
      summary: '',
      faultDesc: '',
      repairPlan: '',
      minAmount: '',
      maxAmount: '',
    },
    nodes: [],
    submitting: false,
    albumId: '',
    pricePreview: {
      mode: PRICE_MODE.RANGE,
      minAmount: null,
      maxAmount: null,
    },
  },

  onLoad() {
    this.initMerchant()
    this.applyTemplate(0)
  },

  async initMerchant() {
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
      wx.showModal({
        title: '请先入驻',
        success: (res) => {
          if (res.confirm) {
            wx.redirectTo({ url: '/packageMerchant/pages/onboarding/index' })
          } else {
            wx.navigateBack()
          }
        },
      })
    }
    this.storeName = (profile && profile.storeName) || '透明维修示范店'
  },

  applyTemplate(index) {
    const tpl = TEMPLATE_LIST[index]
    const nodes = (tpl.nodes || []).map((n) => ({
      ...n,
      images: [],
      note: '',
    }))
    this.setData({
      templateIndex: index,
      nodes,
      'form.serviceName': tpl.serviceName,
    })
  },

  onTemplateChange(e) {
    const index = Number(e.detail.value)
    this.applyTemplate(index)
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [`form.${field}`]: e.detail.value }, () => {
      if (field === 'minAmount' || field === 'maxAmount') {
        this.syncPricePreview()
      }
    })
  },

  syncPricePreview() {
    const min = parseInt(this.data.form.minAmount, 10)
    const max = parseInt(this.data.form.maxAmount, 10)
    this.setData({
      pricePreview: {
        mode: PRICE_MODE.RANGE,
        minAmount: Number.isFinite(min) ? min : null,
        maxAmount: Number.isFinite(max) ? max : null,
      },
    })
  },

  onNodeImages(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) return
    const nodes = this.data.nodes.slice()
    nodes[index].images = (e.detail && e.detail.images) || []
    this.setData({ nodes })
  },

  buildPayload() {
    const tpl = TEMPLATE_LIST[this.data.templateIndex]
    const min = parseInt(this.data.form.minAmount, 10)
    const max = parseInt(this.data.form.maxAmount, 10)
    return {
      id: this.data.albumId || undefined,
      templateId: tpl.id,
      serviceName: tpl.serviceName,
      vehicleText: normalizeVehicleText(this.data.form.vehicleText) === '未填写车型'
        ? ''
        : this.data.form.vehicleText.trim(),
      summary: this.data.form.summary,
      faultDesc: this.data.form.faultDesc,
      repairPlan: this.data.form.repairPlan,
      nodes: this.data.nodes,
      storeName: this.storeName,
      priceMode: PRICE_MODE.RANGE,
      minAmount: Number.isFinite(min) ? min : 0,
      maxAmount: Number.isFinite(max) ? max : 0,
      aiSummary: this.data.form.summary,
      priceFactors: ['车型', '配件品牌', '损伤程度'],
    }
  },

  async onSaveDraft() {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      await saveAlbum(this.buildPayload(), false)
      wx.showToast({ title: '草稿已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    } finally {
      this.setData({ submitting: false })
    }
  },

  async onSubmit() {
    if (this.data.submitting) return
    const hasImage = this.data.nodes.some((n) => (n.images || []).length > 0)
    if (!hasImage) {
      wx.showToast({ title: '请至少上传一张过程图', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      const album = await saveAlbum(this.buildPayload(), false)
      const task = await createTask({
        bizType: BIZ_TYPE.MERCHANT_HISTORY,
        bizId: album.id,
        nodes: album.nodes,
      })
      this.setData({ albumId: album.id })
      wx.navigateTo({
        url: `/packageMerchant/pages/desensitize/workbench/index?taskId=${task.taskId}&albumId=${album.id}&from=album_create&bizType=${BIZ_TYPE.MERCHANT_HISTORY}`,
      })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
