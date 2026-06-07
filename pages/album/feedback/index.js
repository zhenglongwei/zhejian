const { submitAlbumFeedback } = require('../../../services/album-feedback')
const { persistLocalImages } = require('../../../utils/media-upload')
const { checkAuth, getSession } = require('../../../utils/auth')
const {
  ALBUM_FEEDBACK_TYPE_OPTIONS,
  ALBUM_FEEDBACK_CONSENT_TEXT,
  validateAlbumFeedbackForm,
} = require('../../../utils/album-feedback-form')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    nodeId: '',
    nodeTitle: '',
    albumTitle: '',
    typeOptions: ALBUM_FEEDBACK_TYPE_OPTIONS,
    consentText: ALBUM_FEEDBACK_CONSENT_TEXT,
    form: {
      feedbackType: '',
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
    const albumId = String(options.albumId || '').trim()
    const nodeId = String(options.nodeId || '').trim()
    const nodeTitle = decodeURIComponent(options.nodeTitle || '')
    const albumTitle = decodeURIComponent(options.albumTitle || '')

    if (!albumId) {
      this.setData({
        status: 'error',
        errorMessage: '缺少相册信息，请从服务相册详情进入',
      })
      return
    }

    wx.setNavigationBarTitle({
      title: nodeId ? '节点问题反馈' : '相册问题反馈',
    })

    const phone = this.resolveDefaultPhone()
    this.setData({
      status: 'ready',
      albumId,
      nodeId,
      nodeTitle,
      albumTitle,
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

  onFeedbackTypeChange(e) {
    this.setData({ 'form.feedbackType': e.detail.value })
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
    const { albumId, nodeId, nodeTitle, form } = this.data
    const phone = String(form.contactPhone || '').replace(/\D/g, '')
    return {
      nodeId,
      nodeTitle,
      feedbackType: form.feedbackType,
      description: form.description.trim(),
      images: form.images || [],
      contactPhone: phone,
      consent: form.consent,
    }
  },

  async onSubmit() {
    if (this.data.submitting) return
    if (!this.ensureAuth()) return

    const validation = validateAlbumFeedbackForm(this.data.form)
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
      const feedback = await submitAlbumFeedback(this.data.albumId, payload)
      wx.redirectTo({
        url: `/pages/album/feedback/result/index?feedbackId=${feedback.id}&success=1`,
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
