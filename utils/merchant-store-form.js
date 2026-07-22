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

const BRAND_AUTH_ITEM_MAX = 8
const RECEPTION_PHOTO_MAX = 6

const EMPTY_DISPLAY_FORM = {
  storePhone: '',
  businessHours: '',
  intro: '',
  services: [],
  facadePhotoUrl: '',
  workshopPhotoUrls: [],
  receptionPhotoUrls: [],
  brandAuthItems: [],
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

function parseTechnicianYearsInput(value) {
  const match = String(value || '')
    .trim()
    .match(/(\d+)/)
  return match ? match[1] : ''
}

/** 展示/落库：数字后固定带「年」 */
function formatTechnicianYears(value) {
  const num = parseTechnicianYearsInput(value)
  return num ? `${num}年` : ''
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

function normalizeWorkshopPhotoUrls(value) {
  if (Array.isArray(value)) {
    return value.map((url) => String(url || '').trim()).filter(Boolean).slice(0, 6)
  }
  const single = String(value || '').trim()
  return single ? [single] : []
}

function normalizeReceptionPhotoUrls(photos = {}) {
  if (Array.isArray(photos.receptionUrls)) {
    return photos.receptionUrls.map((url) => String(url || '').trim()).filter(Boolean).slice(0, RECEPTION_PHOTO_MAX)
  }
  if (Array.isArray(photos.receptionPhotoUrls)) {
    return photos.receptionPhotoUrls.map((url) => String(url || '').trim()).filter(Boolean).slice(0, RECEPTION_PHOTO_MAX)
  }
  const single = String(photos.receptionUrl || photos.receptionPhotoUrl || '').trim()
  return single ? [single] : []
}

function normalizeBrandAuthItems(list, fallbackValidUntil = '') {
  if (!Array.isArray(list) || !list.length) return []
  return list
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const imageUrl = String(item.imageUrl || item.url || item.photoUrl || '').trim()
      if (!imageUrl) return null
      const brandName = String(item.brandName || item.name || item.brand || '').trim() || '品牌授权'
      return {
        id: String(item.id || `brand_auth_${index + 1}`).trim(),
        brandName: brandName.slice(0, 32),
        imageUrl,
        validUntil: String(item.validUntil || fallbackValidUntil || '').trim(),
      }
    })
    .filter(Boolean)
    .slice(0, BRAND_AUTH_ITEM_MAX)
}

function readBrandAuthItemsFromProfile(profile) {
  const photos = profile.photos || {}
  if (Array.isArray(profile.brandAuthItems) && profile.brandAuthItems.length) {
    return normalizeBrandAuthItems(profile.brandAuthItems, profile.brandAuthValidUntil)
  }
  if (Array.isArray(photos.brandAuthItems) && photos.brandAuthItems.length) {
    return normalizeBrandAuthItems(photos.brandAuthItems, profile.brandAuthValidUntil)
  }
  const legacyUrl = String(photos.brandAuthUrl || profile.brandAuthPhotoUrl || '').trim()
  if (!legacyUrl) return []
  return normalizeBrandAuthItems(
    [
      {
        id: 'brand_auth_1',
        brandName: '品牌授权',
        imageUrl: legacyUrl,
        validUntil: profile.brandAuthValidUntil || '',
      },
    ],
    profile.brandAuthValidUntil
  )
}

function createEmptyBrandAuthItem() {
  return {
    id: `brand_auth_${Date.now()}`,
    brandName: '',
    imageUrl: '',
    validUntil: '',
  }
}

function profileToDisplayForm(profile) {
  const photos = profile.photos || {}
  return {
    storePhone: profile.storePhone || profile.phone || '',
    businessHours: profile.businessHours || '',
    intro: profile.intro || '',
    services: profile.services || [],
    facadePhotoUrl: photos.facadeUrl || '',
    workshopPhotoUrls: normalizeWorkshopPhotoUrls(photos.workshopUrls),
    receptionPhotoUrls: normalizeReceptionPhotoUrls(photos),
    brandAuthItems: readBrandAuthItemsFromProfile(profile),
    specialtyBrandsText: joinTags(profile.specialtyBrands),
    notAcceptingText: joinTags(profile.notAccepting),
    technicians: Array.isArray(profile.technicians)
      ? profile.technicians.map((item, index) => ({
          ...item,
          id: item.id || `tech_${index + 1}`,
          years: parseTechnicianYearsInput(item.years || ''),
          credentialsText: item.credentialsText || joinTags(item.credentials),
          avatarUrl: item.avatarUrl || '',
          credentialPhotoUrls: Array.isArray(item.credentialPhotoUrls)
            ? item.credentialPhotoUrls.filter(Boolean)
            : [],
        }))
      : [],
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
    qualificationTypeLabel: q.baseTypeLabel || q.typeLabel || findQualificationLabel(q.baseType || q.type) || '—',
    qualificationPhotoUrl: q.photoUrl || '',
    qualificationNo: q.certNo || '—',
    qualificationValidUntil: q.validUntil || '—',
    newEnergyEnabled: Boolean(q.newEnergy && q.newEnergy.enabled),
    newEnergyTypeLabel: (q.newEnergy && q.newEnergy.typeLabel) || '新能源专项资质',
    newEnergyPhotoUrl: (q.newEnergy && q.newEnergy.photoUrl) || '',
    newEnergyNo: (q.newEnergy && q.newEnergy.certNo) || '—',
    newEnergyValidUntil: (q.newEnergy && q.newEnergy.validUntil) || '—',
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
      years: formatTechnicianYears(item.years),
      credentials: splitTags(item.credentialsText || joinTags(item.credentials)),
      avatarUrl: String(item.avatarUrl || '').trim(),
      credentialPhotoUrls: Array.isArray(item.credentialPhotoUrls)
        ? item.credentialPhotoUrls.map((url) => String(url || '').trim()).filter(Boolean).slice(0, 6)
        : [],
    }))
    .filter((item) => item.name)

  const brandAuthItems = normalizeBrandAuthItems(form.brandAuthItems)
  const receptionPhotoUrls = normalizeWorkshopPhotoUrls(form.receptionPhotoUrls).slice(
    0,
    RECEPTION_PHOTO_MAX
  )

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
    brandAuthItems,
    brandAuthValidUntil: brandAuthItems[0]?.validUntil || '',
    photos: {
      facadeUrl: form.facadePhotoUrl,
      workshopUrls: normalizeWorkshopPhotoUrls(form.workshopPhotoUrls),
      receptionUrls: receptionPhotoUrls,
      receptionUrl: receptionPhotoUrls[0] || '',
      brandAuthItems,
      brandAuthUrl: brandAuthItems[0]?.imageUrl || '',
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
  if (!normalizeWorkshopPhotoUrls(form.workshopPhotoUrls).length) {
    return '请至少上传一张工位照片'
  }
  const brandAuthItems = Array.isArray(form.brandAuthItems) ? form.brandAuthItems : []
  for (let i = 0; i < brandAuthItems.length; i += 1) {
    const item = brandAuthItems[i] || {}
    const brandName = String(item.brandName || '').trim()
    const imageUrl = String(item.imageUrl || '').trim()
    const validUntil = String(item.validUntil || '').trim()
    if (!brandName) {
      return `请填写第 ${i + 1} 条品牌授权的品牌名称`
    }
    if (!imageUrl) {
      return `请为「${brandName}」上传授权证明图片`
    }
    if (!validUntil) {
      return `请填写「${brandName}」的授权有效期`
    }
  }
  return ''
}

module.exports = {
  EMPTY_DISPLAY_FORM,
  EQUIPMENT_PRESETS,
  BRAND_AUTH_ITEM_MAX,
  RECEPTION_PHOTO_MAX,
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
  parseTechnicianYearsInput,
  formatTechnicianYears,
  normalizeBrandAuthItems,
  createEmptyBrandAuthItem,
  normalizeReceptionPhotoUrls,
  normalizeWorkshopPhotoUrls,
}
