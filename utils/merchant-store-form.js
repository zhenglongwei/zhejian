const {
  MERCHANT_SERVICE_TAG_OPTIONS,
  MERCHANT_SERVICE_TAG_MAX,
  MERCHANT_SERVICE_TAG_NAME_MAX,
} = require('../constants/merchant-service-tags')
const { findQualificationLabel } = require('../constants/onboarding')
const {
  parseBusinessHours,
  formatBusinessHours,
  validateBusinessHours,
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
  brandAuthValidUntil: '',
  specialtyBrandsText: '',
  notAcceptingText: '',
  technicians: [],
  equipmentTags: [],
}

const EQUIPMENT_PRESETS = [
  '烤漆房',
  '四轮定位',
  '诊断电脑',
  '新能源工位',
  '举升机',
  '轮胎动平衡',
  '空调冷媒机',
]

function splitTags(text) {
  return String(text || '')
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20)
}

function joinTags(list) {
  return (list || []).join('、')
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
    brandAuthPhotoUrl: photos.brandAuthUrl || profile.brandAuthPhotoUrl || '',
    brandAuthValidUntil: profile.brandAuthValidUntil || '',
    specialtyBrandsText: joinTags(profile.specialtyBrands),
    notAcceptingText: joinTags(profile.notAccepting),
    technicians: Array.isArray(profile.technicians) ? profile.technicians : [],
    equipmentTags: Array.isArray(profile.equipmentTags) ? profile.equipmentTags : [],
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
  const equipmentTags = (form.equipmentTags || [])
    .map((item) => {
      if (typeof item === 'string') return { id: item, label: item, imageUrl: '' }
      return {
        id: item.id || item.label,
        label: item.label || '',
        imageUrl: item.imageUrl || '',
      }
    })
    .filter((item) => item.label)
  const technicians = (form.technicians || [])
    .map((item, index) => ({
      id: item.id || `tech_${index + 1}`,
      name: String(item.name || '').trim(),
      role: String(item.role || '维修技师').trim() || '维修技师',
      years: String(item.years || '').trim(),
      credentials: splitTags(item.credentialsText || joinTags(item.credentials)),
    }))
    .filter((item) => item.name)

  return {
    storeId,
    storePhone: form.storePhone,
    businessHours: form.businessHours,
    intro: form.intro,
    services: form.services || [],
    specialtyBrands: splitTags(form.specialtyBrandsText),
    notAccepting: splitTags(form.notAcceptingText),
    technicians,
    equipmentTags,
    brandAuthValidUntil: form.brandAuthValidUntil || '',
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
  if (options.businessHoursDaily) {
    const hoursMessage = validateBusinessHours(
      options.businessHoursDaily,
      options.businessHoursClosures
    )
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
  EQUIPMENT_PRESETS,
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
  splitTags,
  joinTags,
}
