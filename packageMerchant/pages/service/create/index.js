const { PRICE_MODE } = require('../../../../constants/price-mode')
const {
  SERVICE_ITEM_LIST,
  PRICE_MODE_OPTIONS,
  getServiceItem,
} = require('../../../../constants/service')
const { saveServicePlan, fetchServiceDetail } = require('../../../../services/service')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')

const PRICE_MODE_PICKER = PRICE_MODE_OPTIONS.filter(
  (o) => o.value !== PRICE_MODE.CONSULT
)

Page({
  data: {
    serviceItems: SERVICE_ITEM_LIST,
    itemIndex: 0,
    priceModes: PRICE_MODE_PICKER,
    priceModeIndex: 0,
    form: {
      name: '',
      summary: '',
      detail: '',
      priceFactorsText: '',
      amount: '',
      minAmount: '',
      maxAmount: '',
    },
    showPriceFields: true,
    submitting: false,
    pricePreview: {
      mode: PRICE_MODE.RANGE,
      amount: null,
      minAmount: null,
      maxAmount: null,
    },
  },

  onLoad(options) {
    this.planId = options.id || ''
    this.initMerchant()
    if (this.planId) {
      this.loadExisting(this.planId)
    } else {
      this.applyServiceItem(0)
      this.syncPricePreview()
    }
  },

  async loadExisting(planId) {
    try {
      const detail = await fetchServiceDetail(planId, { audience: 'merchant' })
      const itemIndex = SERVICE_ITEM_LIST.findIndex(
        (item) => item.id === detail.serviceItemId
      )
      const idx = itemIndex >= 0 ? itemIndex : 0
      let priceModeIndex = PRICE_MODE_PICKER.findIndex(
        (o) => o.value === detail.priceMode
      )
      if (priceModeIndex < 0) priceModeIndex = 0
      const mode = PRICE_MODE_PICKER[priceModeIndex].value
      this.setData({
        itemIndex: idx,
        priceModeIndex,
        showPriceFields: mode === PRICE_MODE.FIXED || mode === PRICE_MODE.RANGE,
        form: {
          name: detail.name || '',
          summary: detail.summary || '',
          detail: detail.detail || '',
          priceFactorsText: (detail.priceFactors || []).join('\n'),
          amount: detail.amount != null ? String(detail.amount) : '',
          minAmount: detail.minAmount != null ? String(detail.minAmount) : '',
          maxAmount: detail.maxAmount != null ? String(detail.maxAmount) : '',
        },
      })
      this.syncPricePreview()
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    }
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
      return
    }
    this.storeName = profile.storeName
  },

  applyServiceItem(index) {
    const item = SERVICE_ITEM_LIST[index]
    if (!item) return
    let priceModeIndex = PRICE_MODE_PICKER.findIndex(
      (o) => o.value === item.defaultPriceMode
    )
    if (priceModeIndex < 0) priceModeIndex = 0
    const mode = PRICE_MODE_PICKER[priceModeIndex].value
    this.setData(
      {
        itemIndex: index,
        priceModeIndex,
        showPriceFields: mode === PRICE_MODE.FIXED || mode === PRICE_MODE.RANGE,
        'form.name': `${item.name} · ${this.storeName || '本店'}`,
      },
      () => this.syncPricePreview()
    )
  },

  onItemChange(e) {
    this.applyServiceItem(Number(e.detail.value))
  },

  onPriceModeChange(e) {
    const index = Number(e.detail.value)
    const mode = PRICE_MODE_PICKER[index].value
    this.setData(
      {
        priceModeIndex: index,
        showPriceFields: mode === PRICE_MODE.FIXED || mode === PRICE_MODE.RANGE,
      },
      () => this.syncPricePreview()
    )
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [`form.${field}`]: e.detail.value }, () => {
      if (
        field === 'amount' ||
        field === 'minAmount' ||
        field === 'maxAmount'
      ) {
        this.syncPricePreview()
      }
    })
  },

  syncPricePreview() {
    const mode = PRICE_MODE_PICKER[this.data.priceModeIndex].value
    const amount = parseInt(this.data.form.amount, 10)
    const min = parseInt(this.data.form.minAmount, 10)
    const max = parseInt(this.data.form.maxAmount, 10)
    this.setData({
      pricePreview: {
        mode,
        amount: Number.isFinite(amount) ? amount : null,
        minAmount: Number.isFinite(min) ? min : null,
        maxAmount: Number.isFinite(max) ? max : null,
      },
    })
  },

  parsePriceFactors(text) {
    return (text || '')
      .split(/[\n,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
  },

  buildPayload() {
    const item = SERVICE_ITEM_LIST[this.data.itemIndex]
    const mode = PRICE_MODE_PICKER[this.data.priceModeIndex].value
    const amount = parseInt(this.data.form.amount, 10)
    const minAmount = parseInt(this.data.form.minAmount, 10)
    const maxAmount = parseInt(this.data.form.maxAmount, 10)
    return {
      id: this.planId || undefined,
      serviceItemId: item.id,
      name: this.data.form.name.trim(),
      summary: this.data.form.summary.trim(),
      detail: this.data.form.detail.trim() || this.data.form.summary.trim(),
      priceMode: mode,
      amount: Number.isFinite(amount) ? amount : null,
      minAmount: Number.isFinite(minAmount) ? minAmount : null,
      maxAmount: Number.isFinite(maxAmount) ? maxAmount : null,
      priceFactors: this.parsePriceFactors(this.data.form.priceFactorsText),
      storeName: this.storeName,
    }
  },

  validate() {
    const { form } = this.data
    if (!form.name.trim()) {
      wx.showToast({ title: '请填写服务名称', icon: 'none' })
      return false
    }
    return true
  },

  async onSaveDraft() {
    if (this.data.submitting || !this.validate()) return
    this.setData({ submitting: true })
    try {
      await saveServicePlan(this.buildPayload(), false)
      wx.showToast({ title: '草稿已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    } finally {
      this.setData({ submitting: false })
    }
  },

  async onSubmit() {
    if (this.data.submitting || !this.validate()) return
    this.setData({ submitting: true })
    try {
      await saveServicePlan(this.buildPayload(), true)
      wx.showToast({ title: '已上架', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    } finally {
      this.setData({ submitting: false })
    }
  },
})
