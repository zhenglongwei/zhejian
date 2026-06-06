const { fetchMerchantProfile, MERCHANT_STATUS } = require('../../../../services/merchant')
const { updateStoreDisplayProfile } = require('../../../../services/merchant-store')
const { uploadImage } = require('../../../../utils/media-upload')
const { isMerchantOwner } = require('../../../../utils/auth')
const {
  EMPTY_DISPLAY_FORM,
  MERCHANT_SERVICE_TAG_MAX,
  MERCHANT_SERVICE_TAG_NAME_MAX,
  MERCHANT_SERVICE_TAG_OPTIONS,
  buildServiceTagViews,
  profileToDisplayForm,
  profileToBasicReadonly,
  buildDisplayPayload,
  validateDisplayForm,
} = require('../../../../utils/merchant-store-form')

Page({
  data: {
    status: 'loading',
    form: { ...EMPTY_DISPLAY_FORM },
    basic: {},
    serviceTags: [],
    serviceOptions: MERCHANT_SERVICE_TAG_OPTIONS,
    customServiceInput: '',
    submitting: false,
    storeId: '',
  },

  onLoad() {
    this.initPage()
  },

  async initPage() {
    if (!isMerchantOwner()) {
      this.setData({ status: 'forbidden' })
      return
    }

    try {
      const profile = await fetchMerchantProfile()
      if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
        wx.showToast({ title: '请先完成入驻审核', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }

      const form = profileToDisplayForm(profile)
      this.setData({
        status: 'normal',
        form,
        basic: profileToBasicReadonly(profile),
        serviceTags: buildServiceTagViews(form.services),
        storeId: profile.storeId || '',
      })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  updateServices(services) {
    this.setData({
      'form.services': services,
      serviceTags: buildServiceTagViews(services),
    })
  },

  onToggleService(e) {
    const { name } = e.currentTarget.dataset
    const list = (this.data.form.services || []).slice()
    const idx = list.indexOf(name)
    if (idx >= 0) {
      list.splice(idx, 1)
    } else if (list.length >= MERCHANT_SERVICE_TAG_MAX) {
      wx.showToast({ title: `最多选择 ${MERCHANT_SERVICE_TAG_MAX} 项`, icon: 'none' })
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
      wx.showToast({ title: `不超过 ${MERCHANT_SERVICE_TAG_NAME_MAX} 字`, icon: 'none' })
      return
    }
    const list = (this.data.form.services || []).slice()
    if (list.indexOf(name) >= 0) {
      this.setData({ customServiceInput: '' })
      return
    }
    if (list.length >= MERCHANT_SERVICE_TAG_MAX) {
      wx.showToast({ title: `最多选择 ${MERCHANT_SERVICE_TAG_MAX} 项`, icon: 'none' })
      return
    }
    list.push(name)
    this.setData({ customServiceInput: '' })
    this.updateServices(list)
  },

  async pickSingleImage(field) {
    const res = await wx.chooseMedia({ count: 1, mediaType: ['image'] })
    const temp = res.tempFiles[0].tempFilePath
    wx.showLoading({ title: '上传中', mask: true })
    try {
      const url = await uploadImage(temp)
      this.setData({ [`form.${field}`]: url })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '上传失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onPickFacade() {
    this.pickSingleImage('facadePhotoUrl')
  },

  onPickReception() {
    this.pickSingleImage('receptionPhotoUrl')
  },

  onPickBrandAuth() {
    this.pickSingleImage('brandAuthPhotoUrl')
  },

  async onPickWorkshop() {
    const remain = 6 - (this.data.form.workshopPhotoUrls || []).length
    if (remain <= 0) {
      wx.showToast({ title: '工位照片最多 6 张', icon: 'none' })
      return
    }
    const res = await wx.chooseMedia({ count: Math.min(remain, 3), mediaType: ['image'] })
    wx.showLoading({ title: '上传中', mask: true })
    try {
      const urls = []
      for (const file of res.tempFiles) {
        urls.push(await uploadImage(file.tempFilePath))
      }
      this.setData({
        'form.workshopPhotoUrls': (this.data.form.workshopPhotoUrls || []).concat(urls),
      })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '上传失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onRemoveWorkshop(e) {
    const { index } = e.currentTarget.dataset
    const list = (this.data.form.workshopPhotoUrls || []).slice()
    list.splice(Number(index), 1)
    this.setData({ 'form.workshopPhotoUrls': list })
  },

  onBackWorkbench() {
    wx.redirectTo({ url: '/packageMerchant/pages/workbench/index' })
  },

  onPreview() {
    const { storeId } = this.data
    if (!storeId) return
    wx.navigateTo({
      url: `/pages/store/detail/index?id=${storeId}&preview=1`,
    })
  },

  onShareStore() {
    const { storeId } = this.data
    if (!storeId) return
    wx.navigateTo({
      url: `/pages/store/detail/index?id=${storeId}&preview=1&share=1`,
    })
  },

  async onSave() {
    if (this.data.submitting) return
    const message = validateDisplayForm(this.data.form)
    if (message) {
      wx.showToast({ title: message, icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      await updateStoreDisplayProfile(
        buildDisplayPayload(this.data.form, this.data.storeId)
      )
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
