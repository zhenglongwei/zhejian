const {
  fetchMerchantProfile,
  submitOnboarding,
  saveOnboardingDraft,
  refreshMerchantSession,
  MERCHANT_STATUS,
} = require('../../../services/merchant')
const {
  MERCHANT_SERVICE_TAG_OPTIONS,
  MERCHANT_SERVICE_TAG_MAX,
  MERCHANT_SERVICE_TAG_NAME_MAX,
} = require('../../../constants/merchant-service-tags')

Page({
  data: {
    form: {
      storeName: '',
      contactName: '',
      phone: '',
      address: '',
      services: [],
    },
    serviceOptions: MERCHANT_SERVICE_TAG_OPTIONS,
    serviceTags: [],
    customServiceInput: '',
    agreed: false,
    submitting: false,
    status: 'loading',
  },

  onLoad() {
    this.initForm()
  },

  async initForm() {
    const profile = await fetchMerchantProfile()
    if (profile && profile.status === MERCHANT_STATUS.APPROVED) {
      wx.redirectTo({ url: '/packageMerchant/pages/workbench/index' })
      return
    }
    if (profile && profile.status === MERCHANT_STATUS.PENDING) {
      this.setData({ status: 'pending', profile })
      return
    }
    if (profile) {
      const services = profile.services || []
      this.setData({
        form: {
          storeName: profile.storeName || '',
          contactName: profile.contactName || '',
          phone: profile.phone || '',
          address: profile.address || '',
          services,
        },
        serviceTags: this.buildTagViews(services),
        status: profile.status === MERCHANT_STATUS.REJECTED ? 'rejected' : 'normal',
        profile,
      })
      return
    }
    this.setData({
      status: 'normal',
      serviceTags: this.buildTagViews([]),
    })
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  buildTagViews(services) {
    const preset = this.data.serviceOptions
    const selected = services || []
    const presetTags = preset.map((name) => ({
      name,
      selected: selected.indexOf(name) >= 0,
    }))
    const customTags = selected
      .filter((name) => preset.indexOf(name) < 0)
      .map((name) => ({
        name,
        selected: true,
      }))
    return presetTags.concat(customTags)
  },

  updateServices(services) {
    this.setData({
      'form.services': services,
      serviceTags: this.buildTagViews(services),
    })
  },

  onToggleService(e) {
    const { name } = e.currentTarget.dataset
    const list = this.data.form.services.slice()
    const idx = list.indexOf(name)
    if (idx >= 0) {
      list.splice(idx, 1)
    } else if (list.length >= MERCHANT_SERVICE_TAG_MAX) {
      wx.showToast({
        title: `最多选择 ${MERCHANT_SERVICE_TAG_MAX} 项`,
        icon: 'none',
      })
      return
    } else {
      list.push(name)
    }
    this.updateServices(list)
  },

  onCustomServiceInput(e) {
    this.setData({ customServiceInput: e.detail.value })
  },

  onCustomServiceCommit() {
    const name = (this.data.customServiceInput || '').trim()
    if (!name) return
    if (name.length > MERCHANT_SERVICE_TAG_NAME_MAX) {
      wx.showToast({
        title: `不超过 ${MERCHANT_SERVICE_TAG_NAME_MAX} 字`,
        icon: 'none',
      })
      return
    }
    const list = this.data.form.services.slice()
    if (list.indexOf(name) >= 0) {
      this.setData({ customServiceInput: '' })
      return
    }
    if (list.length >= MERCHANT_SERVICE_TAG_MAX) {
      wx.showToast({
        title: `最多选择 ${MERCHANT_SERVICE_TAG_MAX} 项`,
        icon: 'none',
      })
      return
    }
    list.push(name)
    this.setData({ customServiceInput: '' })
    this.updateServices(list)
  },

  onAgreeChange(e) {
    this.setData({ agreed: e.detail.value.length > 0 })
  },

  validate() {
    const { storeName, contactName, phone, address, services } = this.data.form
    if (!storeName || !contactName || !phone || !address) {
      wx.showToast({ title: '请填写必填项', icon: 'none' })
      return false
    }
    if (!services || !services.length) {
      wx.showToast({ title: '请至少选择一项擅长服务', icon: 'none' })
      return false
    }
    if (!this.data.agreed) {
      wx.showToast({ title: '请阅读并同意入驻说明', icon: 'none' })
      return false
    }
    return true
  },

  async onSaveDraft() {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      await saveOnboardingDraft(this.data.form)
      wx.showToast({ title: '草稿已保存', icon: 'success' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  async onSubmit() {
    if (this.data.submitting || !this.validate()) return
    this.setData({ submitting: true })
    try {
      const result = await submitOnboarding(this.data.form)
      const profile = result.profile || result
      if (profile.status === MERCHANT_STATUS.APPROVED) {
        wx.showToast({ title: '入驻已通过', icon: 'success' })
        setTimeout(() => {
          wx.redirectTo({ url: '/packageMerchant/pages/workbench/index' })
        }, 600)
        return
      }
      if (profile.status === MERCHANT_STATUS.PENDING) {
        this.setData({ status: 'pending', profile })
        wx.showToast({ title: '已提交，等待平台审核', icon: 'none' })
        return
      }
      wx.showToast({ title: '提交成功', icon: 'success' })
    } catch (e) {
      wx.showToast({
        title: (e && e.message) || '提交失败',
        icon: 'none',
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  async onRefreshAudit() {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      await refreshMerchantSession()
      const profile = await fetchMerchantProfile()
      if (profile && profile.status === MERCHANT_STATUS.APPROVED) {
        wx.showToast({ title: '审核已通过', icon: 'success' })
        setTimeout(() => {
          wx.redirectTo({ url: '/packageMerchant/pages/workbench/index' })
        }, 600)
        return
      }
      this.setData({
        profile: profile || null,
        status: profile && profile.status === MERCHANT_STATUS.PENDING ? 'pending' : 'normal',
      })
      wx.showToast({ title: '仍在审核中', icon: 'none' })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '刷新失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
