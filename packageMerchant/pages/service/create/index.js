const { PRICE_MODE } = require('../../../../constants/price-mode')
const {
  SERVICE_ITEM_LIST,
  PRICE_MODE_OPTIONS,
  getServiceItem,
} = require('../../../../constants/service')
const { saveServicePlan } = require('../../../../services/service')
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
    isAccident: false,
    submitting: false,
    pricePreview: {
      mode: PRICE_MODE.RANGE,
      amount: null,
      minAmount: null,
      maxAmount: null,
    },
  },

  onLoad() {
    this.initMerchant()
    this.applyServiceItem(0)
    this.syncPricePreview()
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
    const isAccident = item.defaultPriceMode === PRICE_MODE.ACCIDENT
    let priceModeIndex = PRICE_MODE_PICKER.findIndex(
      (o) => o.value === item.defaultPriceMode
    )
    if (priceModeIndex < 0) priceModeIndex = 1
    const mode = isAccident
      ? PRICE_MODE.ACCIDENT
      : PRICE_MODE_PICKER[priceModeIndex].value
    this.setData(
      {
        itemIndex: index,
        priceModeIndex: isAccident ? 2 : priceModeIndex,
        isAccident,
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
    if (this.data.isAccident) return
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
    const mode = this.data.isAccident
      ? PRICE_MODE.ACCIDENT
      : PRICE_MODE_PICKER[this.data.priceModeIndex].value
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
    const mode = this.data.isAccident
      ? PRICE_MODE.ACCIDENT
      : PRICE_MODE_PICKER[this.data.priceModeIndex].value
    const amount = parseInt(this.data.form.amount, 10)
    const minAmount = parseInt(this.data.form.minAmount, 10)
    const maxAmount = parseInt(this.data.form.maxAmount, 10)
    return {
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

  validate(submitReview) {
    const { form, showPriceFields, isAccident } = this.data
    if (!form.name.trim()) {
      wx.showToast({ title: '请填写服务名称', icon: 'none' })
      return false
    }
    if (submitReview && !form.summary.trim()) {
      wx.showToast({ title: '请填写服务简介', icon: 'none' })
      return false
    }
    if (submitReview && !form.detail.trim() && !form.summary.trim()) {
      wx.showToast({ title: '请填写服务详情', icon: 'none' })
      return false
    }
    const payload = this.buildPayload()
    if (payload.priceMode === PRICE_MODE.FIXED && !payload.amount) {
      wx.showToast({ title: '请填写一口价', icon: 'none' })
      return false
    }
    if (payload.priceMode === PRICE_MODE.RANGE) {
      if (!payload.minAmount || !payload.maxAmount) {
        wx.showToast({ title: '请填写参考区间', icon: 'none' })
        return false
      }
      if (payload.maxAmount < payload.minAmount) {
        wx.showToast({ title: '最高价不能低于最低价', icon: 'none' })
        return false
      }
      if (submitReview && !payload.priceFactors.length) {
        wx.showToast({ title: '请填写价格影响因素', icon: 'none' })
        return false
      }
    }
    if (isAccident && payload.priceMode !== PRICE_MODE.ACCIDENT) {
      wx.showToast({ title: '事故车仅支持预约到店报价', icon: 'none' })
      return false
    }
    return true
  },

  async onSaveDraft() {
    if (this.data.submitting || !this.validate(false)) return
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
    if (this.data.submitting || !this.validate(true)) return
    this.setData({ submitting: true })
    try {
      await saveServicePlan(this.buildPayload(), true)
      wx.showToast({ title: '已提交并上架', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    } finally {
      this.setData({ submitting: false })
    }
  },
})
