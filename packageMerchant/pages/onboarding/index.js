const {
  fetchMerchantProfile,
  submitOnboarding,
  saveOnboardingDraft,
  refreshMerchantSession,
  recognizeLicenseOcr,
  beginNewMerchantStore,
  MERCHANT_STATUS,
} = require('../../../services/merchant')
const {
  MERCHANT_SERVICE_TAG_OPTIONS,
  MERCHANT_SERVICE_TAG_MAX,
  MERCHANT_SERVICE_TAG_NAME_MAX,
} = require('../../../constants/merchant-service-tags')
const {
  ONBOARDING_QUALIFICATION_OPTIONS,
  ONBOARDING_COMPLIANCE_TEXT,
} = require('../../../constants/onboarding')
const {
  MERCHANT_ONBOARDING_HERO,
  MERCHANT_ONBOARDING_VALUE_ITEMS,
  MERCHANT_ONBOARDING_POSITIONING,
} = require('../../../constants/merchant-onboarding-copy')
const { uploadImage } = require('../../../utils/media-upload')
const {
  BUSINESS_HOUR_PRESETS,
  createScheduleFromPreset,
  buildBusinessHoursEditorState,
  formatBusinessHours,
  validateBusinessHoursSchedule,
} = require('../../../utils/business-hours')

const EMPTY_FORM = {
  storeName: '',
  contactName: '',
  phone: '',
  storePhone: '',
  address: '',
  latitude: '',
  longitude: '',
  locationLabel: '',
  businessHours: '',
  intro: '',
  services: [],
  legalName: '',
  creditCode: '',
  licensePhotoUrl: '',
  contactEmail: '',
  qualificationType: 'class_3',
  qualificationPhotoUrl: '',
  qualificationNo: '',
  qualificationValidUntil: '',
  facadePhotoUrl: '',
  workshopPhotoUrls: [],
  receptionPhotoUrl: '',
  brandAuthPhotoUrl: '',
}

Page({
  data: {
    form: { ...EMPTY_FORM },
    serviceOptions: MERCHANT_SERVICE_TAG_OPTIONS,
    serviceTags: [],
    qualificationOptions: ONBOARDING_QUALIFICATION_OPTIONS,
    qualificationIndex: 0,
    complianceText: ONBOARDING_COMPLIANCE_TEXT,
    heroCopy: MERCHANT_ONBOARDING_HERO,
    valueItems: MERCHANT_ONBOARDING_VALUE_ITEMS,
    positioningNotice: MERCHANT_ONBOARDING_POSITIONING,
    customServiceInput: '',
    businessHoursSchedule: [],
    businessHoursRemark: '',
    businessHoursPreview: '',
    businessHourPresets: BUSINESS_HOUR_PRESETS,
    agreed: false,
    submitting: false,
    status: 'loading',
    merchantId: '',
    newStoreMode: false,
  },

  onLoad(options = {}) {
    this.newStoreMode = options.newStore === '1'
    this.targetMerchantId = options.merchantId || ''
    this.initForm()
  },

  profileToForm(profile) {
    const q = profile.qualification || {}
    const photos = profile.photos || {}
    const qualIndex = ONBOARDING_QUALIFICATION_OPTIONS.findIndex(
      (o) => o.value === (q.type || 'class_3')
    )
    return {
      form: {
        storeName: profile.storeName || '',
        contactName: profile.contactName || '',
        phone: profile.phone || '',
        storePhone: profile.storePhone || profile.phone || '',
        address: profile.address || '',
        latitude: profile.latitude != null ? String(profile.latitude) : '',
        longitude: profile.longitude != null ? String(profile.longitude) : '',
        locationLabel: profile.address || '',
        businessHours: profile.businessHours || '',
        intro: profile.intro || '',
        services: profile.services || [],
        legalName: profile.legalName || '',
        creditCode: profile.creditCode || '',
        licensePhotoUrl: profile.licensePhotoUrl || '',
        contactEmail: profile.contactEmail || '',
        qualificationType: q.type || 'class_3',
        qualificationPhotoUrl: q.photoUrl || '',
        qualificationNo: q.certNo || '',
        qualificationValidUntil: q.validUntil || '',
        facadePhotoUrl: photos.facadeUrl || '',
        workshopPhotoUrls: photos.workshopUrls || [],
        receptionPhotoUrl: photos.receptionUrl || '',
        brandAuthPhotoUrl: photos.brandAuthUrl || '',
      },
      qualificationIndex: qualIndex >= 0 ? qualIndex : 0,
      serviceTags: this.buildTagViews(profile.services || []),
    }
  },

  buildBusinessHoursState(raw) {
    return buildBusinessHoursEditorState(raw)
  },

  applyBusinessHoursPatch(patch, rawBusinessHours) {
    const hours = this.buildBusinessHoursState(rawBusinessHours)
    return {
      ...patch,
      businessHoursSchedule: hours.businessHoursSchedule,
      businessHoursRemark: hours.businessHoursRemark,
      businessHoursPreview: hours.businessHoursPreview,
    }
  },

  async initForm() {
    if (this.newStoreMode) {
      try {
        const profile = await beginNewMerchantStore()
        const patch = this.profileToForm(profile)
        const hours = this.buildBusinessHoursState(patch.form.businessHours)
        this.setData({
          ...this.applyBusinessHoursPatch({ ...patch, status: 'normal', profile, merchantId: profile.merchantId || '' }, patch.form.businessHours),
          merchantId: profile.merchantId || '',
          newStoreMode: true,
        })
      } catch (e) {
        wx.showToast({ title: (e && e.message) || '无法创建新门店', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 800)
      }
      return
    }

    const profile = await fetchMerchantProfile({
      merchantId: this.targetMerchantId,
      preferIncomplete: !this.targetMerchantId,
    })
    if (profile && profile.status === MERCHANT_STATUS.APPROVED && !this.targetMerchantId) {
      wx.redirectTo({ url: '/packageMerchant/pages/store-picker/index' })
      return
    }
    if (profile && profile.status === MERCHANT_STATUS.PENDING) {
      this.setData({ status: 'pending', profile, merchantId: profile.merchantId || '' })
      return
    }
    if (profile) {
      const patch = this.profileToForm(profile)
      const status =
        profile.status === MERCHANT_STATUS.NEED_MODIFY
          ? 'need_modify'
          : profile.status === MERCHANT_STATUS.REJECTED
            ? 'rejected'
            : 'normal'
      this.setData(this.applyBusinessHoursPatch({ ...patch, status, profile, merchantId: profile.merchantId || '' }, patch.form.businessHours))
      return
    }
    const hours = this.buildBusinessHoursState('')
    this.setData({
      status: 'normal',
      serviceTags: this.buildTagViews([]),
      businessHoursSchedule: hours.businessHoursSchedule,
      businessHoursRemark: hours.businessHoursRemark,
      businessHoursPreview: hours.businessHoursPreview,
    })
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  syncBusinessHours() {
    const text = formatBusinessHours(
      this.data.businessHoursSchedule,
      this.data.businessHoursRemark
    )
    this.setData({
      'form.businessHours': text,
      businessHoursPreview: text,
    })
  },

  onApplyBusinessHoursPreset(e) {
    const { preset } = e.currentTarget.dataset
    this.setData({
      businessHoursSchedule: createScheduleFromPreset(preset),
    })
    this.syncBusinessHours()
  },

  onToggleBusinessDay(e) {
    const { index } = e.currentTarget.dataset
    const schedule = (this.data.businessHoursSchedule || []).slice()
    const day = schedule[Number(index)]
    if (!day) return
    day.open = !day.open
    this.setData({ businessHoursSchedule: schedule })
    this.syncBusinessHours()
  },

  onBusinessDayTimeChange(e) {
    const { index, field } = e.currentTarget.dataset
    const schedule = (this.data.businessHoursSchedule || []).slice()
    const day = schedule[Number(index)]
    if (!day) return
    day[field] = e.detail.value
    this.setData({ businessHoursSchedule: schedule })
    this.syncBusinessHours()
  },

  onBusinessHoursRemarkInput(e) {
    this.setData({ businessHoursRemark: e.detail.value })
    this.syncBusinessHours()
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
      .map((name) => ({ name, selected: true }))
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
    const list = this.data.form.services.slice()
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

  onQualificationChange(e) {
    const index = Number(e.detail.value)
    const item = ONBOARDING_QUALIFICATION_OPTIONS[index]
    this.setData({
      qualificationIndex: index,
      'form.qualificationType': item ? item.value : '',
    })
  },

  onChooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          'form.address': res.address || res.name || this.data.form.address,
          'form.latitude': String(res.latitude),
          'form.longitude': String(res.longitude),
          'form.locationLabel': res.name || res.address || '',
        })
      },
      fail: () => {
        wx.showToast({ title: '请授权位置或手动填写地址', icon: 'none' })
      },
    })
  },

  async pickSingleImage(field, options = {}) {
    const { onUploaded } = options
    const res = await wx.chooseMedia({ count: 1, mediaType: ['image'] })
    const temp = res.tempFiles[0].tempFilePath
    wx.showLoading({ title: '上传中', mask: true })
    try {
      const url = await uploadImage(temp)
      this.setData({ [`form.${field}`]: url })
      if (typeof onUploaded === 'function') {
        await onUploaded(url)
      }
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '上传失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  applyLicenseOcrResult(result = {}) {
    const patch = {}
    const form = this.data.form || {}
    if (result.legalName && !form.legalName) {
      patch['form.legalName'] = result.legalName
    }
    if (result.creditCode && !form.creditCode) {
      patch['form.creditCode'] = result.creditCode
    }
    if (result.legalPerson && !form.contactName) {
      patch['form.contactName'] = result.legalPerson
    }
    if (Object.keys(patch).length) {
      this.setData(patch)
      wx.showToast({ title: '已识别，请核对', icon: 'none' })
      return
    }
    if (result.legalName || result.creditCode) {
      wx.showModal({
        title: '识别到营业执照信息',
        content: '是否用识别结果覆盖当前已填写的主体信息？',
        confirmText: '覆盖',
        success: (res) => {
          if (!res.confirm) return
          const overwrite = {}
          if (result.legalName) overwrite['form.legalName'] = result.legalName
          if (result.creditCode) overwrite['form.creditCode'] = result.creditCode
          if (result.legalPerson) overwrite['form.contactName'] = result.legalPerson
          this.setData(overwrite)
          wx.showToast({ title: '已更新，请核对', icon: 'none' })
        },
      })
      return
    }
    wx.showToast({ title: '未识别到关键信息，请手填', icon: 'none' })
  },

  async runLicenseOcr(licensePhotoUrl) {
    wx.showLoading({ title: '识别中', mask: true })
    try {
      const result = await recognizeLicenseOcr(licensePhotoUrl)
      this.applyLicenseOcrResult(result)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '识别失败，请手动填写', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onPickLicense() {
    this.pickSingleImage('licensePhotoUrl', {
      onUploaded: (url) => this.runLicenseOcr(url),
    })
  },

  onPickFacade() {
    this.pickSingleImage('facadePhotoUrl')
  },

  onPickQualification() {
    this.pickSingleImage('qualificationPhotoUrl')
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

  onAgreeChange(e) {
    this.setData({ agreed: e.detail.value.length > 0 })
  },

  buildPayload() {
    const { form, merchantId, profile } = this.data
    return {
      ...form,
      merchantId: merchantId || (profile && profile.merchantId) || '',
      qualification: {
        type: form.qualificationType,
        photoUrl: form.qualificationPhotoUrl,
        certNo: form.qualificationNo,
        validUntil: form.qualificationValidUntil,
      },
      photos: {
        facadeUrl: form.facadePhotoUrl,
        workshopUrls: form.workshopPhotoUrls || [],
        receptionUrl: form.receptionPhotoUrl,
        brandAuthUrl: form.brandAuthPhotoUrl,
      },
    }
  },

  validate() {
    const f = this.data.form
    if (!f.legalName || !f.creditCode || !f.licensePhotoUrl) {
      wx.showToast({ title: '请完善商家主体信息', icon: 'none' })
      return false
    }
    if (!f.storeName || !f.contactName || !f.phone || !f.address) {
      wx.showToast({ title: '请填写门店与联系人信息', icon: 'none' })
      return false
    }
    if (!f.latitude || !f.longitude) {
      wx.showToast({ title: '请在地图上选择门店位置', icon: 'none' })
      return false
    }
    if (!f.qualificationType || !f.qualificationPhotoUrl) {
      wx.showToast({ title: '请完善维修资质信息', icon: 'none' })
      return false
    }
    if (f.businessHours) {
      const hoursMessage = validateBusinessHoursSchedule(this.data.businessHoursSchedule)
      if (hoursMessage) {
        wx.showToast({ title: hoursMessage, icon: 'none' })
        return false
      }
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
      await saveOnboardingDraft(this.buildPayload())
      wx.showToast({ title: '草稿已保存', icon: 'success' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  async onSubmit() {
    if (this.data.submitting || !this.validate()) return
    this.setData({ submitting: true })
    try {
      const result = await submitOnboarding({
        ...this.buildPayload(),
        agreed: this.data.agreed,
      })
      const profile = result.profile || result
      if (profile.status === MERCHANT_STATUS.APPROVED) {
        wx.showToast({ title: '入驻已通过', icon: 'success' })
        setTimeout(() => {
          wx.redirectTo({ url: '/packageMerchant/pages/store-picker/index' })
        }, 600)
        return
      }
      if (profile.status === MERCHANT_STATUS.PENDING) {
        this.setData({ status: 'pending', profile, merchantId: profile.merchantId || '' })
        wx.showToast({ title: '已提交，等待审核', icon: 'none' })
        setTimeout(() => {
          wx.redirectTo({ url: '/packageMerchant/pages/store-picker/index' })
        }, 800)
        return
      }
      wx.showToast({ title: '提交成功', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  async onRefreshAudit() {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      await refreshMerchantSession()
      const profile = await fetchMerchantProfile({
        merchantId: this.data.profile?.merchantId || this.data.merchantId,
      })
      if (profile && profile.status === MERCHANT_STATUS.APPROVED) {
        wx.showToast({ title: '审核已通过', icon: 'success' })
        setTimeout(() => {
          wx.redirectTo({ url: '/packageMerchant/pages/store-picker/index' })
        }, 600)
        return
      }
      this.setData({
        profile: profile || null,
        status:
          profile && profile.status === MERCHANT_STATUS.PENDING
            ? 'pending'
            : profile && profile.status === MERCHANT_STATUS.NEED_MODIFY
              ? 'need_modify'
              : profile && profile.status === MERCHANT_STATUS.REJECTED
                ? 'rejected'
                : 'normal',
      })
      wx.showToast({ title: '仍在审核中', icon: 'none' })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '刷新失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
