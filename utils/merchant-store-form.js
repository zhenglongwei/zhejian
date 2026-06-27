const {
  MERCHANT_SERVICE_TAG_OPTIONS,
  MERCHANT_SERVICE_TAG_MAX,
  MERCHANT_SERVICE_TAG_NAME_MAX,
} = require('../constants/merchant-service-tags')
const { findQualificationLabel } = require('../constants/onboarding')
const {
  parseBusinessHours,
  formatBusinessHours,
  validateBusinessHoursSchedule,
} = require('./business-hours')

const EMPTY_DISPLAY_FORM = {
  storePhone: '',
  businessHours: '',
  intro: '',
  services: [],
  facadePhotoUrl: '',
  workshopPhotoUrls: [],
  receptionPhotoUrl: '',
  brandAuthPhotoUrl: '',
}

function buildServiceTagViews(services, options = MERCHANT_SERVICE_TAG_OPTIONS) {
  const selected = services || []
  const presetTags = options.map((name) => ({
    name,
    selected: selected.indexOf(name) >= 0,
  }))
  const customTags = selected
    .filter((name) => options.indexOf(name) < 0)
    .map((name) => ({ name, selected: true }))
  return presetTags.concat(customTags)
}

function profileToDisplayForm(profile) {
  const photos = profile.photos || {}
  return {
    storePhone: profile.storePhone || profile.phone || '',
    businessHours: profile.businessHours || '',
    intro: profile.intro || '',
    services: profile.services || [],
    facadePhotoUrl: photos.facadeUrl || '',
    workshopPhotoUrls: photos.workshopUrls || [],
    receptionPhotoUrl: photos.receptionUrl || '',
    brandAuthPhotoUrl: photos.brandAuthUrl || '',
  }
}

function profileToBasicReadonly(profile) {
  const q = profile.qualification || {}
  return {
    storeName: profile.storeName || '—',
    address: profile.address || '—',
    legalName: profile.legalName || '—',
    creditCode: profile.creditCode || '—',
    licensePhotoUrl: profile.licensePhotoUrl || '',
    contactName: profile.contactName || '—',
    phone: profile.phone || '—',
    contactEmail: profile.contactEmail || '—',
    qualificationTypeLabel: q.typeLabel || findQualificationLabel(q.type) || '—',
    qualificationPhotoUrl: q.photoUrl || '',
    qualificationNo: q.certNo || '—',
    qualificationValidUntil: q.validUntil || '—',
  }
}

function buildDisplayPayload(form, storeId) {
  return {
    storeId,
    storePhone: form.storePhone,
    businessHours: form.businessHours,
    intro: form.intro,
    services: form.services || [],
    photos: {
      facadeUrl: form.facadePhotoUrl,
      workshopUrls: form.workshopPhotoUrls || [],
      receptionUrl: form.receptionPhotoUrl,
      brandAuthUrl: form.brandAuthPhotoUrl,
    },
  }
}

function validateDisplayForm(form, options = {}) {
  if (!form.storePhone) {
    return '请填写门店电话'
  }
  if (options.businessHoursSchedule) {
    const hoursMessage = validateBusinessHoursSchedule(options.businessHoursSchedule)
    if (hoursMessage) return hoursMessage
  }
  if (!form.businessHours) {
    return '请填写营业时间'
  }
  if (!form.services || !form.services.length) {
    return '请至少选择一项擅长服务'
  }
  if (!form.facadePhotoUrl) {
    return '请上传门头照片'
  }
  if (!form.workshopPhotoUrls || !form.workshopPhotoUrls.length) {
    return '请至少上传一张工位照片'
  }
  return ''
}

module.exports = {
  EMPTY_DISPLAY_FORM,
  MERCHANT_SERVICE_TAG_MAX,
  MERCHANT_SERVICE_TAG_NAME_MAX,
  MERCHANT_SERVICE_TAG_OPTIONS,
  buildServiceTagViews,
  profileToDisplayForm,
  profileToBasicReadonly,
  buildDisplayPayload,
  validateDisplayForm,
  parseBusinessHours,
  formatBusinessHours,
}
