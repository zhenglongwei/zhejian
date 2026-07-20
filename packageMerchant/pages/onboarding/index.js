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
  ONBOARDING_BASE_QUALIFICATION_OPTIONS,
  ONBOARDING_COMPLIANCE_TEXT,
  ONBOARDING_AGREEMENT_LINK,
  buildOnboardingConsentParts,
} = require('../../../constants/onboarding')
const {
  MERCHANT_ONBOARDING_HERO,
} = require('../../../constants/merchant-onboarding-copy')
const { redirectAfterMerchantApproved } = require('../../../utils/merchant-plan-select')
const { uploadImage, normalizeStoredImageUrl } = require('../../../utils/media-upload')
const {
  chooseStoreLocation,
  getChooseLocationFailMessage,
} = require('../../../utils/choose-location')
const { DESIGN_TOKENS } = require('../../../constants/design-tokens')

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
  newEnergyEnabled: false,
  newEnergyPhotoUrl: '',
  newEnergyNo: '',
  newEnergyValidUntil: '',
  facadePhotoUrl: '',
  workshopPhotoUrls: [],
  receptionPhotoUrl: '',
  brandAuthPhotoUrl: '',
}

function padDatePart(n) {
  return String(n).padStart(2, '0')
}

function formatToday() {
  const d = new Date()
  return `${d.getFullYear()}-${padDatePart(d.getMonth() + 1)}-${padDatePart(d.getDate())}`
}

/** 归一为 YYYY-MM-DD，无法识别则返回空串 */
function normalizeDateValue(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  const matched = text.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  if (!matched) return ''
  const y = Number(matched[1])
  const m = Number(matched[2])
  const day = Number(matched[3])
  if (!y || m < 1 || m > 12 || day < 1 || day > 31) return ''
  return `${y}-${padDatePart(m)}-${padDatePart(day)}`
}

Page({
  data: {
    form: { ...EMPTY_FORM },
    today: formatToday(),
    qualificationOptions: ONBOARDING_BASE_QUALIFICATION_OPTIONS,
    qualificationIndex: 0,
    complianceText: ONBOARDING_COMPLIANCE_TEXT,
    consentTextBefore: buildOnboardingConsentParts().before,
    consentTextAfter: buildOnboardingConsentParts().after,
    agreementLink: ONBOARDING_AGREEMENT_LINK,
    heroCopy: MERCHANT_ONBOARDING_HERO,
    switchColor: DESIGN_TOKENS.COLOR_PRIMARY,
    agreed: false,
    submitting: false,
    status: 'loading',
    merchantId: '',
    newStoreMode: false,
    licenseOcrHint: '',
  },

  onLoad(options = {}) {
    this.newStoreMode = options.newStore === '1'
    this.targetMerchantId = options.merchantId || ''
    this.initForm()
  },

  profileToForm(profile) {
    const q = profile.qualification || {}
    const photos = profile.photos || {}
    const ne = q.newEnergy || {}
    const baseType =
      q.baseType ||
      (q.type && q.type !== 'new_energy' ? q.type : '') ||
      'class_3'
    const qualIndex = ONBOARDING_BASE_QUALIFICATION_OPTIONS.findIndex(
      (o) => o.value === baseType
    )
    const newEnergyEnabled =
      Boolean(ne.enabled) ||
      (Array.isArray(q.specialties) && q.specialties.indexOf('new_energy') >= 0) ||
      q.type === 'new_energy'
    const hasLocation =
      profile.latitude != null &&
      profile.longitude != null &&
      String(profile.latitude) !== '' &&
      String(profile.longitude) !== ''
    return {
      form: {
        storeName: profile.storeName || '',
        contactName: profile.contactName || '',
        phone: profile.phone || '',
        storePhone: profile.storePhone || profile.phone || '',
        address: hasLocation ? profile.address || '' : '',
        latitude: hasLocation ? String(profile.latitude) : '',
        longitude: hasLocation ? String(profile.longitude) : '',
        locationLabel: hasLocation ? profile.address || '' : '',
        businessHours: profile.businessHours || '',
        intro: profile.intro || '',
        services: profile.services || [],
        legalName: profile.legalName || '',
        creditCode: profile.creditCode || '',
        licensePhotoUrl: profile.licensePhotoUrl || '',
        contactEmail: profile.contactEmail || '',
        qualificationType: baseType,
        qualificationPhotoUrl: q.type === 'new_energy' ? '' : q.photoUrl || '',
        qualificationNo: q.type === 'new_energy' ? '' : q.certNo || '',
        qualificationValidUntil: normalizeDateValue(
          q.type === 'new_energy' ? '' : q.validUntil
        ),
        newEnergyEnabled,
        newEnergyPhotoUrl:
          ne.photoUrl || (q.type === 'new_energy' ? q.photoUrl || '' : ''),
        newEnergyNo: ne.certNo || (q.type === 'new_energy' ? q.certNo || '' : ''),
        newEnergyValidUntil: normalizeDateValue(
          ne.validUntil || (q.type === 'new_energy' ? q.validUntil : '')
        ),
        facadePhotoUrl: photos.facadeUrl || '',
        workshopPhotoUrls: photos.workshopUrls || [],
        receptionPhotoUrl: photos.receptionUrl || '',
        brandAuthPhotoUrl: photos.brandAuthUrl || '',
      },
      qualificationIndex: qualIndex >= 0 ? qualIndex : 0,
    }
  },

  async initForm() {
    if (this.newStoreMode) {
      try {
        const profile = await beginNewMerchantStore()
        const patch = this.profileToForm(profile)
        this.setData({
          ...patch,
          status: 'normal',
          profile,
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
      redirectAfterMerchantApproved(profile.merchantId, 'onboarding')
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
      this.setData({ ...patch, status, profile, merchantId: profile.merchantId || '' })
      return
    }
    this.setData({ status: 'normal' })
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onQualificationChange(e) {
    const index = Number(e.detail.value)
    const item = ONBOARDING_BASE_QUALIFICATION_OPTIONS[index]
    this.setData({
      qualificationIndex: index,
      'form.qualificationType': item ? item.value : '',
    })
  },

  onValidUntilChange(e) {
    this.setData({ 'form.qualificationValidUntil': e.detail.value || '' })
  },

  onNewEnergyToggle(e) {
    const enabled = Boolean(e.detail.value)
    this.setData({
      'form.newEnergyEnabled': enabled,
      ...(enabled
        ? {}
        : {
            'form.newEnergyPhotoUrl': '',
            'form.newEnergyNo': '',
            'form.newEnergyValidUntil': '',
          }),
    })
  },

  onNewEnergyValidUntilChange(e) {
    this.setData({ 'form.newEnergyValidUntil': e.detail.value || '' })
  },

  async onChooseLocation() {
    if (this._choosingLocation) return
    this._choosingLocation = true
    try {
      const { form } = this.data
      const privacyPopup = this.selectComponent('#privacyAuthorizePopup')
      const res = await chooseStoreLocation(
        {
          latitude: form.latitude,
          longitude: form.longitude,
        },
        { privacyPopup }
      )
      this.setData({
        'form.address': res.address || res.name || '',
        'form.latitude': String(res.latitude),
        'form.longitude': String(res.longitude),
        'form.locationLabel': res.name || res.address || '',
      })
    } catch (err) {
      const message = getChooseLocationFailMessage(err)
      if (message) {
        wx.showToast({ title: message, icon: 'none' })
      }
    } finally {
      this._choosingLocation = false
    }
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

  applyLicenseOcrResult(result = {}, options = {}) {
    const form = this.data.form || {}
    const patch = {}
    const conflicts = []
    const labels = {
      legalName: '主体名称',
      creditCode: '信用代码',
      contactName: '负责人',
      storeName: '门店名称',
    }

    const assignField = (field, value) => {
      const next = String(value || '').trim()
      if (!next) return
      const current = String(form[field] || '').trim()
      if (!current) {
        patch[`form.${field}`] = next
        return
      }
      if (current !== next) {
        conflicts.push({ field, label: labels[field] || field, value: next })
      }
    }

    assignField('legalName', result.legalName)
    assignField('creditCode', result.creditCode)
    assignField('contactName', result.legalPerson)
    if (!form.storeName && result.legalName) {
      patch['form.storeName'] = result.legalName
    }

    const applyPatch = (extraPatch = {}) => {
      const merged = { ...patch, ...extraPatch }
      if (Object.keys(merged).length) {
        this.setData(merged)
      }
    }

    const filledLabels = Object.keys(patch)
      .map((key) => labels[key.replace('form.', '')])
      .filter(Boolean)

    if (conflicts.length) {
      applyPatch()
      const preview = conflicts.map((item) => `${item.label}：${item.value}`).join('\n')
      wx.showModal({
        title: '识别到新的营业执照信息',
        content: `${preview}\n\n是否覆盖当前已填写内容？`,
        confirmText: '覆盖',
        cancelText: '保留',
        success: (res) => {
          if (!res.confirm) {
            this.setData({
              licenseOcrHint: filledLabels.length
                ? `已识别并填入：${filledLabels.join('、')}；其余字段已保留你的填写`
                : '部分字段与当前填写不一致，已保留你的填写',
            })
            return
          }
          const overwrite = {}
          conflicts.forEach((item) => {
            overwrite[`form.${item.field}`] = item.value
          })
          applyPatch(overwrite)
          this.setData({
            licenseOcrHint: '已用识别结果更新主体信息，请核对后提交',
          })
          wx.showToast({ title: '已更新，请核对', icon: 'none' })
        },
      })
      if (filledLabels.length && !options.silent) {
        wx.showToast({ title: `已识别：${filledLabels.join('、')}`, icon: 'none' })
      }
      return
    }

    if (Object.keys(patch).length) {
      applyPatch()
      this.setData({
        licenseOcrHint: `已识别：${filledLabels.join('、')}，请核对后提交`,
      })
      wx.showToast({ title: '已识别，请核对', icon: 'success' })
      return
    }

    if (result.legalName || result.creditCode) {
      this.setData({ licenseOcrHint: '识别完成，当前填写与执照一致' })
      wx.showToast({ title: '识别完成，信息一致', icon: 'none' })
      return
    }

    this.setData({ licenseOcrHint: '未识别到主体名称或信用代码，请手动填写' })
    wx.showToast({ title: '未识别到关键信息，请手填', icon: 'none' })
  },

  async onPickLicense() {
    if (this.data.submitting) return
    try {
      const res = await wx.chooseMedia({ count: 1, mediaType: ['image'] })
      const temp = res.tempFiles[0].tempFilePath
      wx.showLoading({ title: '上传中', mask: true })
      const url = await uploadImage(temp)
      wx.showLoading({ title: '识别中', mask: true })
      this.setData({
        'form.licensePhotoUrl': url,
        licenseOcrHint: '正在识别营业执照…',
      })
      const result = await recognizeLicenseOcr(normalizeStoredImageUrl(url))
      wx.hideLoading()
      this.applyLicenseOcrResult(result)
    } catch (e) {
      wx.hideLoading()
      if (this.data.form.licensePhotoUrl) {
        this.setData({ licenseOcrHint: '照片已上传，识别未成功，请手动填写主体信息' })
      }
      wx.showToast({ title: (e && e.message) || '识别失败，请手动填写', icon: 'none' })
    }
  },

  onPickFacade() {
    this.pickSingleImage('facadePhotoUrl')
  },

  onPickQualification() {
    this.pickSingleImage('qualificationPhotoUrl')
  },

  onPickNewEnergy() {
    this.pickSingleImage('newEnergyPhotoUrl')
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

  onToggleAgreement() {
    this.setData({ agreed: !this.data.agreed })
  },

  onOpenMerchantAgreement() {
    wx.navigateTo({
      url: '/packageMerchant/pages/legal-document/index?type=merchant',
    })
  },

  buildPayload() {
    const { form, merchantId, profile } = this.data
    return {
      ...form,
      merchantId: merchantId || (profile && profile.merchantId) || '',
      qualification: {
        baseType: form.qualificationType,
        type: form.qualificationType,
        photoUrl: form.qualificationPhotoUrl,
        certNo: form.qualificationNo,
        validUntil: normalizeDateValue(form.qualificationValidUntil),
        specialties: form.newEnergyEnabled ? ['new_energy'] : [],
        newEnergy: {
          enabled: Boolean(form.newEnergyEnabled),
          photoUrl: form.newEnergyEnabled ? form.newEnergyPhotoUrl : '',
          certNo: form.newEnergyEnabled ? form.newEnergyNo : '',
          validUntil: form.newEnergyEnabled
            ? normalizeDateValue(form.newEnergyValidUntil)
            : '',
        },
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
      wx.showToast({ title: '请完善基础维修资质信息', icon: 'none' })
      return false
    }
    if (f.newEnergyEnabled && !f.newEnergyPhotoUrl) {
      wx.showToast({ title: '请上传新能源专项资质照片', icon: 'none' })
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
          redirectAfterMerchantApproved(profile.merchantId, 'submit')
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
          redirectAfterMerchantApproved(profile.merchantId, 'audit')
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
