const { fetchLeadConfirm, createLead } = require('../../../services/lead')
const { fetchDefaultVehicle } = require('../../../services/vehicle')
const { persistLocalImages } = require('../../../utils/media-upload')
const { PRICE_MODE } = require('../../../constants/price-mode')
const { checkAuth, getSession, maskPhone } = require('../../../utils/auth')
const {
  validateLeadForm,
  getSubmitButtonLabel,
  getConsultPageTitle,
} = require('../../../utils/lead-form')
const { requestUserNotificationSubscribe } = require('../../../utils/subscribe-message')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    confirm: null,
    isMessageMode: false,
    isAccident: false,
    showPriceCompliance: false,
    priceDisclaimerText: '',
    submitLabel: '提交留言',
    descriptionPlaceholder: '简要描述车辆问题或咨询需求（选填）',
    form: {
      brand: '',
      series: '',
      description: '',
      images: [],
      contactName: '',
      contactPhone: '',
      appointmentDate: '',
      appointmentSlot: '',
      appointmentDateLabel: '',
      platformConsent: false,
      accidentConsent: false,
    },
    dateOptions: [],
    slotOptions: [],
    dateIndex: 0,
    slotIndex: 0,
    submitting: false,
    loginSheetVisible: false,
    loginSheetMode: 'auto',
  },

  onLoad(options) {
    this.serviceId = options.serviceId || ''
    this.storeId = options.storeId || ''
    this.caseId = options.caseId || ''
    this.sourcePage = options.sourcePage || ''

    if (!this.serviceId && !this.storeId) {
      this.setData({
        status: 'error',
        errorMessage: '缺少门店信息，请从门店或案例页进入',
      })
      return
    }
    wx.setNavigationBarTitle({
      title: getConsultPageTitle(this.serviceId ? 'service' : 'message'),
    })
    this.loadConfirm()
  },

  async loadConfirm() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const confirm = await fetchLeadConfirm({
        serviceId: this.serviceId,
        storeId: this.storeId,
        caseId: this.caseId,
        sourcePage: this.sourcePage || (this.caseId ? 'case' : ''),
      })
      const dates = confirm.bookingDates || []
      const firstDate = dates[0]
      const slots = firstDate ? firstDate.slots : []
      const isMessageMode = confirm.mode === 'message'
      let defaultBrand = ''
      let defaultSeries = ''
      try {
        const defaultVehicle = await fetchDefaultVehicle()
        if (defaultVehicle) {
          defaultBrand = defaultVehicle.brand || ''
          defaultSeries = defaultVehicle.series || ''
        }
      } catch (vehicleErr) {
        // 无默认车辆时不阻断咨询表单
      }

      this.setData({
        confirm,
        isMessageMode,
        isAccident: Boolean(confirm.isAccident),
        showPriceCompliance:
          !isMessageMode &&
          (confirm.service.priceMode === PRICE_MODE.RANGE ||
            confirm.service.priceMode === PRICE_MODE.CONSULT),
        priceDisclaimerText:
          !isMessageMode && confirm.service.priceMode === PRICE_MODE.FIXED
            ? '标注价格为参考，实际费用以门店确认为准'
            : '',
        submitLabel: getSubmitButtonLabel(
          isMessageMode ? null : confirm.service.priceMode,
          confirm.mode
        ),
        descriptionPlaceholder:
          confirm.consultGuide ||
          confirm.descriptionHint ||
          '简要描述车辆问题或咨询需求（选填）',
        dateOptions: dates.map((d) => d.label),
        slotOptions: slots,
        dateIndex: 0,
        slotIndex: 0,
        form: {
          brand: defaultBrand,
          series: defaultSeries,
          description: '',
          images: [],
          contactName: '',
          contactPhone: this.resolveContactPhone(confirm.defaultContact),
          appointmentDate: firstDate ? firstDate.value : '',
          appointmentSlot: slots[0] || '',
          appointmentDateLabel: firstDate ? firstDate.label : '',
          platformConsent: false,
          accidentConsent: false,
        },
        status: 'normal',
      })
      this.bookingDates = dates
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败，请重试',
      })
    }
  },

  onRetry() {
    this.loadConfirm()
  },

  resolveContactPhone(defaultContact = {}) {
    if (defaultContact.phone) return String(defaultContact.phone)
    const { user } = getSession()
    if (user && user.phone) return String(user.phone)
    return ''
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onImagesChange(e) {
    this.setData({ 'form.images': e.detail.images || [] })
  },

  onDateChange(e) {
    const dateIndex = Number(e.detail.value) || 0
    const dates = this.bookingDates || []
    const picked = dates[dateIndex]
    const slots = picked ? picked.slots : []
    this.setData({
      dateIndex,
      slotIndex: 0,
      slotOptions: slots,
      'form.appointmentDate': picked ? picked.value : '',
      'form.appointmentDateLabel': picked ? picked.label : '',
      'form.appointmentSlot': slots[0] || '',
    })
  },

  onSlotChange(e) {
    const slotIndex = Number(e.detail.value) || 0
    const slot = this.data.slotOptions[slotIndex] || ''
    this.setData({
      slotIndex,
      'form.appointmentSlot': slot,
    })
  },

  togglePlatformConsent() {
    this.setData({
      'form.platformConsent': !this.data.form.platformConsent,
    })
  },

  toggleAccidentConsent() {
    this.setData({
      'form.accidentConsent': !this.data.form.accidentConsent,
    })
  },

  ensureAuth() {
    const auth = checkAuth({ needPhone: true })
    if (!auth.ok) {
      this.setData({
        loginSheetVisible: true,
        loginSheetMode: auth.reason === 'bindPhone' ? 'bindPhone' : 'auto',
      })
      return false
    }
    return true
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
  },

  onLoginSheetSuccess() {
    this.closeLoginSheet()
    if (this.serviceId || this.storeId) {
      this.loadConfirm()
    }
  },

  buildPayload() {
    const { confirm, form, isAccident, isMessageMode } = this.data
    const appointment =
      form.appointmentDate && form.appointmentSlot
        ? {
            date: form.appointmentDate,
            slot: form.appointmentSlot,
            dateLabel: form.appointmentDateLabel,
          }
        : {}
    const service = confirm.service || {}
    return {
      serviceId: service.id || '',
      serviceName: service.name || '',
      storeId: confirm.store.id,
      storeName: confirm.store.name,
      storePhone: confirm.store.phone || '',
      caseId: this.caseId || (confirm.caseContext && confirm.caseContext.caseId) || '',
      sourcePage:
        this.sourcePage ||
        confirm.sourcePage ||
        (isMessageMode ? 'message' : 'service'),
      leadType: isMessageMode ? 'message' : 'service',
      priceMode: service.priceMode || '',
      isAccident,
      vehicle: {
        brand: form.brand.trim(),
        series: form.series.trim(),
      },
      description: form.description.trim(),
      images: form.images || [],
      appointment,
      contact: {
        name: form.contactName.trim(),
        phone: String(form.contactPhone || '').replace(/\D/g, ''),
        phoneDisplay: maskPhone(String(form.contactPhone || '').replace(/\D/g, '')),
      },
      platformConsent: form.platformConsent,
    }
  },

  async onSubmit() {
    if (this.data.submitting) return
    if (!this.ensureAuth()) return

    const validation = validateLeadForm(this.data.form, {
      isAccident: this.data.isAccident,
    })
    if (!validation.ok) {
      wx.showToast({ title: validation.message, icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      // 一次性订阅：提交前授权，便于后续「门店已联系/关闭」微信通知
      await requestUserNotificationSubscribe('consult', { showToast: false })
      let payload = this.buildPayload()
      if (payload.images && payload.images.length) {
        const { images, droppedStaleCount } = await persistLocalImages(payload.images)
        if (droppedStaleCount > 0) {
          wx.showToast({ title: '部分图片已失效，请重新选择', icon: 'none' })
        }
        payload = { ...payload, images }
      }
      const lead = await createLead(payload)
      wx.redirectTo({
        url: `/pages/consult/result/index?leadId=${lead.id}&success=1`,
      })
    } catch (e) {
      wx.showToast({
        title: (e && e.message) || '提交失败，请稍后重试',
        icon: 'none',
      })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
