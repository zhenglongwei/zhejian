const { fetchOrderConfirm, submitOrderConfirm } = require('../../services/order')
const { ORDER_TYPE } = require('../../constants/order-type')
const { PRICE_MODE } = require('../../constants/price-mode')
const { checkAuth } = require('../../utils/auth')
const {
  validateConfirmForm,
  getSubmitButtonLabel,
  getConfirmPageTitle,
  isBookingOrderType,
} = require('../../utils/order-form')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    confirm: null,
    orderType: '',
    isAccident: false,
    isBooking: false,
    isStandardOrder: false,
    showPriceCompliance: false,
    submitLabel: '提交并支付',
    form: {
      brand: '',
      series: '',
      plate: '',
      contactName: '',
      appointmentDate: '',
      appointmentSlot: '',
      appointmentDateLabel: '',
      liabilityAccepted: false,
    },
    dateOptions: [],
    slotOptions: [],
    dateIndex: 0,
    slotIndex: 0,
    submitting: false,
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    loginSheetBindContext: 'order',
  },

  onLoad(options) {
    this.serviceId = options.serviceId || ''
    this.storeId = options.storeId || ''
    if (!this.serviceId) {
      this.setData({
        status: 'error',
        errorMessage: '缺少服务信息，请从服务详情进入',
      })
      return
    }
    this.loadConfirm()
  },

  async loadConfirm() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const confirm = await fetchOrderConfirm({
        serviceId: this.serviceId,
        storeId: this.storeId,
      })
      const orderType = confirm.orderType
      const dates = confirm.bookingDates || []
      const firstDate = dates[0]
      const slots = firstDate ? firstDate.slots : []
      wx.setNavigationBarTitle({ title: getConfirmPageTitle(orderType) })

      this.setData({
        confirm,
        orderType,
        isAccident: orderType === ORDER_TYPE.ACCIDENT_BOOKING,
        isBooking: isBookingOrderType(orderType),
        isStandardOrder: orderType === ORDER_TYPE.STANDARD_ORDER,
        showPriceCompliance:
          confirm.service.priceMode === PRICE_MODE.RANGE ||
          confirm.service.priceMode === PRICE_MODE.CONSULT,
        submitLabel: getSubmitButtonLabel(orderType),
        dateOptions: dates.map((d) => d.label),
        slotOptions: slots,
        dateIndex: 0,
        slotIndex: 0,
        form: {
          brand: '',
          series: '',
          plate: '',
          contactName: confirm.defaultContact.name || '',
          appointmentDate: firstDate ? firstDate.value : '',
          appointmentSlot: slots[0] || '',
          appointmentDateLabel: firstDate ? firstDate.label : '',
          liabilityAccepted: false,
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

  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [`form.${field}`]: e.detail.value })
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

  toggleLiability() {
    this.setData({
      'form.liabilityAccepted': !this.data.form.liabilityAccepted,
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
    if (this.serviceId) {
      this.loadConfirm()
    }
  },

  buildPayload() {
    const { confirm, form, orderType } = this.data
    return {
      orderType,
      serviceId: confirm.service.id,
      serviceName: confirm.service.name,
      storeId: confirm.store.id,
      storeName: confirm.store.name,
      vehicle: {
        brand: form.brand.trim(),
        series: form.series.trim(),
        plate: form.plate.trim(),
      },
      appointment: {
        date: form.appointmentDate,
        slot: form.appointmentSlot,
        dateLabel: form.appointmentDateLabel,
      },
      contact: {
        name: form.contactName.trim(),
        phoneDisplay: confirm.defaultContact.phoneDisplay,
      },
      priceSummary: confirm.priceSummary,
      liabilityAccepted: form.liabilityAccepted,
    }
  },

  async onSubmit() {
    if (this.data.submitting) return
    if (!this.ensureAuth()) return

    const validation = validateConfirmForm(this.data.form, this.data.orderType)
    if (!validation.ok) {
      wx.showToast({ title: validation.message, icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const payload = this.buildPayload()
      const { order, paid } = await submitOrderConfirm(payload)
      wx.redirectTo({
        url: `/pages/order-result/index?orderId=${order.id}&success=1&paid=${paid ? 1 : 0}`,
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
