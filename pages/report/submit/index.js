const { submitReport } = require('../../../services/report')
const { persistLocalImages } = require('../../../utils/media-upload')
const { checkAuth, getSession } = require('../../../utils/auth')
const {
  REPORT_TYPE_OPTIONS,
  REPORT_CONSENT_TEXT,
  getTargetTypeLabel,
  validateReportForm,
} = require('../../../utils/report-form')

const VALID_TARGETS = new Set(['service', 'case'])

Page({
  data: {
    status: 'ready',
    errorMessage: '',
    targetType: '',
    targetId: '',
    targetTitle: '',
    targetTypeLabel: '',
    typeOptions: REPORT_TYPE_OPTIONS,
    consentText: REPORT_CONSENT_TEXT,
    form: {
      reportType: '',
      description: '',
      images: [],
      contactPhone: '',
      consent: false,
    },
    descriptionLength: 0,
    submitting: false,
    loginSheetVisible: false,
  },

  onLoad(options) {
    const targetType = String(options.targetType || '').trim()
    const targetId = String(options.targetId || '').trim()
    const targetTitle = decodeURIComponent(options.targetTitle || '')

    if (!VALID_TARGETS.has(targetType) || !targetId) {
      this.setData({
        status: 'error',
        errorMessage: '缺少举报对象，请从服务或案例详情页进入',
      })
      return
    }

    wx.setNavigationBarTitle({ title: '举报虚假信息' })

    const phone = this.resolveDefaultPhone()
    this.setData({
      targetType,
      targetId,
      targetTitle,
      targetTypeLabel: getTargetTypeLabel(targetType),
      'form.contactPhone': phone,
    })

    if (!checkAuth().ok) {
      this.setData({ loginSheetVisible: true })
    }
  },

  resolveDefaultPhone() {
    const { user } = getSession()
    return user && user.phone ? String(user.phone) : ''
  },

  onSelectType(e) {
    const { value } = e.currentTarget.dataset
    this.setData({ 'form.reportType': value })
  },

  onDescriptionInput(e) {
    const value = e.detail.value || ''
    this.setData({
      'form.description': value,
      descriptionLength: value.length,
    })
  },

  onPhoneInput(e) {
    this.setData({ 'form.contactPhone': e.detail.value })
  },

  onImagesChange(e) {
    this.setData({ 'form.images': e.detail.images || [] })
  },

  toggleConsent() {
    this.setData({ 'form.consent': !this.data.form.consent })
  },

  ensureAuth() {
    const auth = checkAuth()
    if (!auth.ok) {
      this.setData({ loginSheetVisible: true })
      return false
    }
    return true
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
  },

  onLoginSuccess() {
    this.closeLoginSheet()
    const phone = this.resolveDefaultPhone()
    if (phone && !this.data.form.contactPhone) {
      this.setData({ 'form.contactPhone': phone })
    }
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  },

  buildPayload() {
    const { targetType, targetId, targetTitle, form } = this.data
    const phone = String(form.contactPhone || '').replace(/\D/g, '')
    return {
      targetType,
      targetId,
      targetTitle,
      reportType: form.reportType,
      description: form.description.trim(),
      images: form.images || [],
      contactPhone: phone,
      consent: form.consent,
    }
  },

  async onSubmit() {
    if (this.data.submitting) return
    if (!this.ensureAuth()) return

    const validation = validateReportForm(this.data.form)
    if (!validation.ok) {
      wx.showToast({ title: validation.message, icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      let payload = this.buildPayload()
      if (payload.images.length) {
        const { images, droppedStaleCount } = await persistLocalImages(payload.images)
        if (droppedStaleCount > 0) {
          wx.showToast({ title: '部分图片已失效，请重新选择', icon: 'none' })
        }
        payload = { ...payload, images }
      }
      const report = await submitReport(payload)
      wx.redirectTo({
        url: `/pages/report/result/index?reportId=${report.id}&success=1`,
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
