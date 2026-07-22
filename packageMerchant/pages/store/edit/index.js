const { fetchMerchantProfile, MERCHANT_STATUS } = require('../../../../services/merchant')
const { updateStoreDisplayProfile } = require('../../../../services/merchant-store')
const { uploadImage } = require('../../../../utils/media-upload')
const { isMerchantOwner } = require('../../../../utils/auth')
const {
  EMPTY_DISPLAY_FORM,
  EQUIPMENT_PRESETS,
  MERCHANT_SERVICE_TAG_MAX,
  MERCHANT_SERVICE_TAG_NAME_MAX,
  MERCHANT_SERVICE_TAG_OPTIONS,
  BRAND_AUTH_ITEM_MAX,
  RECEPTION_PHOTO_MAX,
  buildServiceTagViews,
  profileToDisplayForm,
  profileToBasicReadonly,
  buildDisplayPayload,
  validateDisplayForm,
  joinTags,
  createEmptyBrandAuthItem,
} = require('../../../../utils/merchant-store-form')
const { buildBusinessHoursEditorState } = require('../../../../utils/business-hours')
const { createBusinessHoursPageHandlers } = require('../../../../utils/business-hours-page')

function buildEquipmentTagViews(selected) {
  const labels = []
  const set = {}
  ;(selected || []).forEach((item) => {
    const name = typeof item === 'string' ? item : item.label
    if (!name || set[name]) return
    set[name] = true
    labels.push(name)
  })
  const presetViews = EQUIPMENT_PRESETS.map((name) => ({
    name,
    selected: !!set[name],
  }))
  const customViews = labels
    .filter((name) => EQUIPMENT_PRESETS.indexOf(name) < 0)
    .map((name) => ({ name, selected: true }))
  return presetViews.concat(customViews)
}

Page({
  data: {
    status: 'loading',
    form: { ...EMPTY_DISPLAY_FORM },
    basic: {},
    serviceTags: [],
    equipmentTagViews: buildEquipmentTagViews([]),
    serviceOptions: MERCHANT_SERVICE_TAG_OPTIONS,
    customServiceInput: '',
    customEquipmentInput: '',
    businessHoursDaily: { start: '09:00', end: '18:00' },
    businessHoursClosures: [],
    businessHoursPreview: '',
    showClosureForm: false,
    closureDraft: { startDate: '', endDate: '', note: '' },
    submitting: false,
    storeId: '',
    capabilityReviewStatus: 'none',
    capabilityRejectReason: '',
  },

  ...createBusinessHoursPageHandlers(),

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
      const hours = buildBusinessHoursEditorState(form.businessHours)
      const daily = hours.businessHoursDaily || { start: '09:00', end: '18:00' }
      if (!daily.start) daily.start = '09:00'
      if (!daily.end) daily.end = '18:00'
      this.setData({
        status: 'normal',
        form: {
          ...form,
          businessHours: hours.businessHoursPreview || form.businessHours,
        },
        basic: profileToBasicReadonly(profile),
        serviceTags: buildServiceTagViews(form.services),
        equipmentTagViews: buildEquipmentTagViews(form.equipmentTags),
        businessHoursDaily: daily,
        businessHoursClosures: hours.businessHoursClosures,
        businessHoursPreview: hours.businessHoursPreview,
        showClosureForm: false,
        closureDraft: hours.closureDraft,
        storeId: profile.storeId || '',
        capabilityReviewStatus: profile.capabilityReviewStatus || 'none',
        capabilityRejectReason: profile.capabilityRejectReason || '',
      })
      // 保证预览文案与 picker 初始值一致
      if (typeof this.syncBusinessHours === 'function') {
        this.syncBusinessHours()
      }
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onThankYouEnabledChange(e) {
    this.setData({ 'form.thankYouEnabled': Boolean(e.detail && e.detail.value) })
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

  onToggleEquipment(e) {
    const { name } = e.currentTarget.dataset
    const current = (this.data.form.equipmentTags || []).slice()
    const labels = current.map((item) => (typeof item === 'string' ? item : item.label))
    const idx = labels.indexOf(name)
    if (idx >= 0) {
      current.splice(idx, 1)
    } else {
      current.push({ id: name, label: name, imageUrl: '' })
    }
    this.setData({
      'form.equipmentTags': current,
      equipmentTagViews: buildEquipmentTagViews(current),
    })
  },

  onCustomEquipmentInput(e) {
    this.setData({ customEquipmentInput: e.detail.value })
  },

  onCustomEquipmentCommit() {
    const name = (this.data.customEquipmentInput || '').trim()
    if (!name) return
    if (name.length > MERCHANT_SERVICE_TAG_NAME_MAX) {
      wx.showToast({ title: `不超过 ${MERCHANT_SERVICE_TAG_NAME_MAX} 字`, icon: 'none' })
      return
    }
    const current = (this.data.form.equipmentTags || []).slice()
    const labels = current.map((item) => (typeof item === 'string' ? item : item.label))
    if (labels.indexOf(name) >= 0) {
      this.setData({ customEquipmentInput: '' })
      return
    }
    if (current.length >= 16) {
      wx.showToast({ title: '设备标签过多', icon: 'none' })
      return
    }
    current.push({ id: name, label: name, imageUrl: '' })
    this.setData({
      customEquipmentInput: '',
      'form.equipmentTags': current,
      equipmentTagViews: buildEquipmentTagViews(current),
    })
  },

  async onPickEquipmentImage(e) {
    const index = Number(e.currentTarget.dataset.index)
    const list = (this.data.form.equipmentTags || []).slice()
    if (!list[index]) return
    const res = await wx.chooseMedia({ count: 1, mediaType: ['image'] })
    const temp = res.tempFiles[0].tempFilePath
    wx.showLoading({ title: '上传中', mask: true })
    try {
      const url = await uploadImage(temp)
      list[index] = { ...list[index], imageUrl: url }
      this.setData({ 'form.equipmentTags': list })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onClearEquipmentImage(e) {
    const index = Number(e.currentTarget.dataset.index)
    const list = (this.data.form.equipmentTags || []).slice()
    if (!list[index]) return
    list[index] = { ...list[index], imageUrl: '' }
    this.setData({ 'form.equipmentTags': list })
  },

  onPreviewEquipmentImage(e) {
    const index = Number(e.currentTarget.dataset.index)
    const item = (this.data.form.equipmentTags || [])[index]
    if (!item || !item.imageUrl) return
    wx.previewImage({ urls: [item.imageUrl], current: item.imageUrl })
  },

  onAddTech() {
    const list = (this.data.form.technicians || []).slice()
    list.push({
      id: `tech_${Date.now()}`,
      name: '',
      role: '维修技师',
      years: '',
      credentialsText: '',
      avatarUrl: '',
      credentialPhotoUrls: [],
    })
    this.setData({ 'form.technicians': list })
  },

  onRemoveTech(e) {
    const index = Number(e.currentTarget.dataset.index)
    const list = (this.data.form.technicians || []).slice()
    list.splice(index, 1)
    this.setData({ 'form.technicians': list })
  },

  onTechInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.technicians[${index}].${field}`]: e.detail.value })
  },

  onTechYearsInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    const digits = String(e.detail.value || '').replace(/[^\d]/g, '').slice(0, 2)
    this.setData({ [`form.technicians[${index}].years`]: digits })
  },

  async onPickTechAvatar(e) {
    const index = Number(e.currentTarget.dataset.index)
    const list = (this.data.form.technicians || []).slice()
    if (!list[index]) return
    const res = await wx.chooseMedia({ count: 1, mediaType: ['image'] })
    const temp = res.tempFiles[0].tempFilePath
    wx.showLoading({ title: '上传中', mask: true })
    try {
      const url = await uploadImage(temp)
      list[index] = { ...list[index], avatarUrl: url }
      this.setData({ 'form.technicians': list })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onClearTechAvatar(e) {
    const index = Number(e.currentTarget.dataset.index)
    const list = (this.data.form.technicians || []).slice()
    if (!list[index]) return
    list[index] = { ...list[index], avatarUrl: '' }
    this.setData({ 'form.technicians': list })
  },

  async onPickTechCredential(e) {
    const index = Number(e.currentTarget.dataset.index)
    const list = (this.data.form.technicians || []).slice()
    if (!list[index]) return
    const current = Array.isArray(list[index].credentialPhotoUrls)
      ? list[index].credentialPhotoUrls.slice()
      : []
    const remain = 6 - current.length
    if (remain <= 0) {
      wx.showToast({ title: '资质证明最多 6 张', icon: 'none' })
      return
    }
    const res = await wx.chooseMedia({ count: Math.min(remain, 3), mediaType: ['image'] })
    wx.showLoading({ title: '上传中', mask: true })
    try {
      const urls = []
      for (const file of res.tempFiles) {
        urls.push(await uploadImage(file.tempFilePath))
      }
      list[index] = {
        ...list[index],
        credentialPhotoUrls: current.concat(urls),
      }
      this.setData({ 'form.technicians': list })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onRemoveTechCredential(e) {
    const techIndex = Number(e.currentTarget.dataset.index)
    const photoIndex = Number(e.currentTarget.dataset.photoIndex)
    const list = (this.data.form.technicians || []).slice()
    if (!list[techIndex]) return
    const photos = Array.isArray(list[techIndex].credentialPhotoUrls)
      ? list[techIndex].credentialPhotoUrls.slice()
      : []
    photos.splice(photoIndex, 1)
    list[techIndex] = { ...list[techIndex], credentialPhotoUrls: photos }
    this.setData({ 'form.technicians': list })
  },

  onPreviewTechImage(e) {
    const url = e.currentTarget.dataset.url
    const techIndex = Number(e.currentTarget.dataset.index)
    if (!url) return
    const tech = (this.data.form.technicians || [])[techIndex]
    const creds =
      tech && Array.isArray(tech.credentialPhotoUrls) ? tech.credentialPhotoUrls.filter(Boolean) : []
    const urls = creds.indexOf(url) >= 0 ? creds : [url]
    wx.previewImage({ urls, current: url })
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

  receptionPhotoList() {
    const list = this.data.form && this.data.form.receptionPhotoUrls
    return Array.isArray(list) ? list : []
  },

  async onPickReception() {
    const current = this.receptionPhotoList()
    const remain = RECEPTION_PHOTO_MAX - current.length
    if (remain <= 0) {
      wx.showToast({ title: `接待区照片最多 ${RECEPTION_PHOTO_MAX} 张`, icon: 'none' })
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
        'form.receptionPhotoUrls': current.concat(urls),
      })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '上传失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onRemoveReception(e) {
    const { index } = e.currentTarget.dataset
    const list = this.receptionPhotoList().slice()
    list.splice(Number(index), 1)
    this.setData({ 'form.receptionPhotoUrls': list })
  },

  onAddBrandAuth() {
    const list = (this.data.form.brandAuthItems || []).slice()
    if (list.length >= BRAND_AUTH_ITEM_MAX) {
      wx.showToast({ title: `最多 ${BRAND_AUTH_ITEM_MAX} 个品牌授权`, icon: 'none' })
      return
    }
    list.push(createEmptyBrandAuthItem())
    this.setData({ 'form.brandAuthItems': list })
  },

  onRemoveBrandAuth(e) {
    const index = Number(e.currentTarget.dataset.index)
    const list = (this.data.form.brandAuthItems || []).slice()
    list.splice(index, 1)
    this.setData({ 'form.brandAuthItems': list })
  },

  onBrandAuthInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.brandAuthItems[${index}].${field}`]: e.detail.value })
  },

  onBrandAuthDateChange(e) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({ [`form.brandAuthItems[${index}].validUntil`]: e.detail.value })
  },

  async onPickBrandAuthImage(e) {
    const index = Number(e.currentTarget.dataset.index)
    const list = (this.data.form.brandAuthItems || []).slice()
    if (!list[index]) return
    const res = await wx.chooseMedia({ count: 1, mediaType: ['image'] })
    const temp = res.tempFiles[0].tempFilePath
    wx.showLoading({ title: '上传中', mask: true })
    try {
      const url = await uploadImage(temp)
      list[index] = { ...list[index], imageUrl: url }
      this.setData({ 'form.brandAuthItems': list })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onClearBrandAuthImage(e) {
    const index = Number(e.currentTarget.dataset.index)
    const list = (this.data.form.brandAuthItems || []).slice()
    if (!list[index]) return
    list[index] = { ...list[index], imageUrl: '' }
    this.setData({ 'form.brandAuthItems': list })
  },

  workshopPhotoList() {
    const list = this.data.form && this.data.form.workshopPhotoUrls
    return Array.isArray(list) ? list : []
  },

  async onPickWorkshop() {
    const current = this.workshopPhotoList()
    const remain = 6 - current.length
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
        'form.workshopPhotoUrls': current.concat(urls),
      })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '上传失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onRemoveWorkshop(e) {
    const { index } = e.currentTarget.dataset
    const list = this.workshopPhotoList().slice()
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
    if (typeof this.syncBusinessHours === 'function') {
      this.syncBusinessHours()
    }
    const message = validateDisplayForm(this.data.form, {
      businessHoursDaily: this.data.businessHoursDaily,
      businessHoursClosures: this.data.businessHoursClosures,
    })
    if (message) {
      wx.showToast({ title: message, icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const profile = await updateStoreDisplayProfile(
        buildDisplayPayload(this.data.form, this.data.storeId)
      )
      const reviewStatus = (profile && profile.capabilityReviewStatus) || 'none'
      this.setData({
        capabilityReviewStatus: reviewStatus,
        capabilityRejectReason: (profile && profile.capabilityRejectReason) || '',
      })
      wx.showToast({
        title: reviewStatus === 'pending' ? '已保存，能力变更待审核' : '已保存',
        icon: 'none',
      })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
