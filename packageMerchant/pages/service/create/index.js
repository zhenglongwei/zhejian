const { PRICE_MODE } = require('../../../../constants/price-mode')
const { PRICE_MODE_OPTIONS } = require('../../../../constants/service')
const {
  buildServiceTagOptions,
  buildMatchedTagViews,
  extractNameQuery,
  matchServiceTags,
  resolveServiceSelection,
  inferSelectionFromPlan,
} = require('../../../../constants/service-plan-selection')
const {
  appointmentJsonFromForm,
  appointmentFormFromJson,
} = require('../../../../constants/service-appointment')
const {
  saveServicePlan,
  fetchServiceDetail,
  fetchMerchantServiceItems,
} = require('../../../../services/service')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')

const PRICE_MODE_PICKER = PRICE_MODE_OPTIONS.filter(
  (o) => o.value !== PRICE_MODE.CONSULT
)

const SERVICE_NAME_MAX = 32

Page({
  data: {
    serviceItems: [],
    serviceTagOptions: [],
    matchedTags: [],
    showNameSuggestions: false,
    nameQuery: '',
    selectedServiceLabel: '',
    selectedServiceItemId: '',
    selectedCategoryId: '',
    itemsReady: false,
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
      acceptConsult: true,
      slotNote: '',
      advanceRequired: false,
      advanceNote: '',
      holidayNote: '',
      consultGuide: '',
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
    this._skipNameBlur = false
    this.bootstrap()
  },

  async bootstrap() {
    const merchantOk = await this.initMerchant()
    if (!merchantOk) return
    const itemsOk = await this.loadServiceItems()
    if (!itemsOk) return
    if (this.planId) {
      await this.loadExisting(this.planId)
    }
  },

  async loadServiceItems() {
    try {
      const { list } = await fetchMerchantServiceItems()
      const serviceTagOptions = buildServiceTagOptions(list)
      this.setData({
        serviceItems: list,
        serviceTagOptions,
        itemsReady: true,
      })
      return true
    } catch (e) {
      wx.showToast({
        title: (e && e.message) || '加载服务项目失败',
        icon: 'none',
      })
      return false
    }
  },

  async loadExisting(planId) {
    try {
      const detail = await fetchServiceDetail(planId, { audience: 'merchant' })
      const selection = inferSelectionFromPlan(
        detail,
        this.data.serviceItems,
        this.storeName
      )
      let priceModeIndex = PRICE_MODE_PICKER.findIndex(
        (o) => o.value === detail.priceMode
      )
      if (priceModeIndex < 0) priceModeIndex = 0
      const mode = PRICE_MODE_PICKER[priceModeIndex].value
      const appointmentForm = appointmentFormFromJson(
        detail.appointmentJson,
        detail.acceptAppointment
      )
      this.setData({
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
          ...appointmentForm,
        },
      })
      if (selection) {
        this.applyServiceSelection(selection.label, {
          preserveFormName: true,
          preservePriceMode: true,
        })
      } else {
        this.syncSelectionFromName(detail.name || '')
      }
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
      return false
    }
    this.storeName = profile.storeName
    return true
  },

  refreshMatchedTags(query, selectedLabel) {
    const matched = matchServiceTags(query, this.data.serviceTagOptions)
    return buildMatchedTagViews(matched, selectedLabel)
  },

  applyServiceSelection(label, opts = {}) {
    const resolved = resolveServiceSelection(label, this.data.serviceItems)
    if (!resolved) return

    let priceModeIndex = PRICE_MODE_PICKER.findIndex(
      (o) => o.value === resolved.defaultPriceMode
    )
    if (priceModeIndex < 0) priceModeIndex = 0
    const mode = PRICE_MODE_PICKER[priceModeIndex].value
    const patch = {
      selectedServiceLabel: resolved.label,
      selectedServiceItemId: resolved.id,
      selectedCategoryId: resolved.categoryId || '',
      nameQuery: resolved.label,
      matchedTags: this.refreshMatchedTags(resolved.label, resolved.label),
      showPriceFields: mode === PRICE_MODE.FIXED || mode === PRICE_MODE.RANGE,
    }
    if (!opts.preservePriceMode) {
      patch.priceModeIndex = priceModeIndex
    }
    if (opts.formName !== undefined) {
      patch['form.name'] = opts.formName
    } else if (!opts.preserveFormName) {
      patch['form.name'] = `${resolved.label} · ${this.storeName || '本店'}`
    }
    this.setData(patch, () => this.syncPricePreview())
  },

  syncSelectionFromName(displayName, opts = {}) {
    const query = extractNameQuery(displayName, this.storeName)
    if (!query) {
      this.setData({
        selectedServiceLabel: '',
        selectedServiceItemId: '',
        selectedCategoryId: '',
        nameQuery: '',
      })
      return
    }
    const resolved = resolveServiceSelection(query, this.data.serviceItems)
    if (!resolved) return

    const patch = {
      selectedServiceLabel: resolved.label,
      selectedServiceItemId: resolved.id,
      selectedCategoryId: resolved.categoryId || '',
      nameQuery: query,
    }
    if (opts.updatePriceMode) {
      let priceModeIndex = PRICE_MODE_PICKER.findIndex(
        (o) => o.value === resolved.defaultPriceMode
      )
      if (priceModeIndex < 0) priceModeIndex = 0
      const mode = PRICE_MODE_PICKER[priceModeIndex].value
      patch.priceModeIndex = priceModeIndex
      patch.showPriceFields = mode === PRICE_MODE.FIXED || mode === PRICE_MODE.RANGE
    }
    this.setData(patch, () => {
      if (opts.updatePriceMode) this.syncPricePreview()
    })
  },

  onNameFocus() {
    const query = extractNameQuery(this.data.form.name, this.storeName)
    this.setData({
      showNameSuggestions: true,
      nameQuery: query,
      matchedTags: this.refreshMatchedTags(query, this.data.selectedServiceLabel),
    })
  },

  onNameBlur() {
    setTimeout(() => {
      if (this._skipNameBlur) {
        this._skipNameBlur = false
        return
      }
      this.setData({ showNameSuggestions: false })
      this.syncSelectionFromName(this.data.form.name)
    }, 200)
  },

  onNameInput(e) {
    const name = e.detail.value
    const query = extractNameQuery(name, this.storeName)
    const matched = matchServiceTags(query, this.data.serviceTagOptions)
    const exactTag = matched.find((entry) => entry.name === query)
    this.setData({
      'form.name': name,
      nameQuery: query,
      showNameSuggestions: true,
      matchedTags: buildMatchedTagViews(matched, exactTag ? exactTag.name : ''),
    })
    if (exactTag && query === exactTag.name) {
      this.syncSelectionFromName(name, { updatePriceMode: true })
    }
  },

  onSelectQuickTag(e) {
    const { name } = e.currentTarget.dataset
    this._skipNameBlur = true
    const displayName = `${name} · ${this.storeName || '本店'}`
    this.applyServiceSelection(name, { formName: displayName })
    this.setData({ showNameSuggestions: false })
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

  onAcceptConsultChange(e) {
    this.setData({ 'form.acceptConsult': Boolean(e.detail.value) })
  },

  onAdvanceRequiredChange(e) {
    this.setData({ 'form.advanceRequired': Boolean(e.detail.value) })
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
    const mode = PRICE_MODE_PICKER[this.data.priceModeIndex].value
    const amount = parseInt(this.data.form.amount, 10)
    const minAmount = parseInt(this.data.form.minAmount, 10)
    const maxAmount = parseInt(this.data.form.maxAmount, 10)
    const query = extractNameQuery(this.data.form.name, this.storeName)
    const resolved =
      resolveServiceSelection(query, this.data.serviceItems) || {}
    return {
      id: this.planId || undefined,
      serviceItemId: resolved.id || this.data.selectedServiceItemId,
      categoryId: resolved.categoryId || this.data.selectedCategoryId,
      name: this.data.form.name.trim(),
      summary: this.data.form.summary.trim(),
      detail: this.data.form.detail.trim() || this.data.form.summary.trim(),
      priceMode: mode,
      amount: Number.isFinite(amount) ? amount : null,
      minAmount: Number.isFinite(minAmount) ? minAmount : null,
      maxAmount: Number.isFinite(maxAmount) ? maxAmount : null,
      priceFactors: this.parsePriceFactors(this.data.form.priceFactorsText),
      acceptAppointment: this.data.form.acceptConsult !== false,
      appointmentJson: appointmentJsonFromForm(this.data.form),
      storeName: this.storeName,
    }
  },

  validate() {
    if (!this.data.itemsReady) {
      wx.showToast({ title: '服务项目加载中', icon: 'none' })
      return false
    }
    const { form } = this.data
    const name = form.name.trim()
    if (!name) {
      wx.showToast({ title: '请填写服务名称', icon: 'none' })
      return false
    }
    if (name.length > SERVICE_NAME_MAX) {
      wx.showToast({ title: `服务名称不超过 ${SERVICE_NAME_MAX} 字`, icon: 'none' })
      return false
    }
    const query = extractNameQuery(name, this.storeName)
    if (!query) {
      wx.showToast({ title: '请填写有效的服务名称', icon: 'none' })
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
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
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
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '上架失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
