const {
  fetchMerchantProfile,
  submitOnboarding,
  saveOnboardingDraft,
  MERCHANT_STATUS,
} = require('../../../services/merchant')

Page({
  data: {
    form: {
      storeName: '',
      contactName: '',
      phone: '',
      address: '',
      services: [],
    },
    serviceOptions: ['刹车维修', '钣喷修复', '保养', '电瓶更换', '轮胎服务'],
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
    if (profile) {
      this.setData({
        form: {
          storeName: profile.storeName || '',
          contactName: profile.contactName || '',
          phone: profile.phone || '',
          address: profile.address || '',
          services: profile.services || [],
        },
        status: 'normal',
      })
      return
    }
    this.setData({ status: 'normal' })
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onToggleService(e) {
    const { name } = e.currentTarget.dataset
    const list = this.data.form.services.slice()
    const idx = list.indexOf(name)
    if (idx >= 0) list.splice(idx, 1)
    else list.push(name)
    this.setData({ 'form.services': list })
  },

  onAgreeChange(e) {
    this.setData({ agreed: e.detail.value.length > 0 })
  },

  validate() {
    const { storeName, contactName, phone, address } = this.data.form
    if (!storeName || !contactName || !phone || !address) {
      wx.showToast({ title: '请填写必填项', icon: 'none' })
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
      await submitOnboarding(this.data.form)
      wx.showToast({ title: '入驻已通过（mock）', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({ url: '/packageMerchant/pages/workbench/index' })
      }, 600)
    } catch (e) {
      wx.showToast({
        title: (e && e.message) || '提交失败',
        icon: 'none',
      })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
