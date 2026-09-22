const { assertPersistentImageUrl } = require('./media-storage')
const { normalizeBrandAuthItems, earliestBrandAuthValidUntil } = require('../utils/store-capability')
const { normalizeLicenseEstablishedOn } = require('../utils/license-established')

/** 基础维修等级（互斥单选） */
const BASE_QUALIFICATION_TYPES = new Set(['class_1', 'class_2', 'class_3', 'record'])

/** 专项能力（可与基础等级并存） */
const SPECIALTY_QUALIFICATION_TYPES = new Set(['new_energy'])

/** 含历史互斥枚举，供兼容读取 */
const QUALIFICATION_TYPES = new Set([
  ...BASE_QUALIFICATION_TYPES,
  ...SPECIALTY_QUALIFICATION_TYPES,
])

const QUALIFICATION_LABELS = {
  class_1: '一类机动车维修',
  class_2: '二类机动车维修',
  class_3: '三类机动车维修',
  record: '维修经营备案',
  new_energy: '新能源专项资质',
}

/** 门店头标/列表短文案 */
const QUALIFICATION_TAG_LABELS = {
  class_1: '一类维修资质',
  class_2: '二类维修资质',
  class_3: '三类维修资质',
  record: '维修经营备案',
  new_energy: '新能源专项',
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.map((s) => String(s).trim()).filter(Boolean)
}

function emptyNewEnergy() {
  return {
    enabled: false,
    photoUrl: '',
    certNo: '',
    validUntil: '',
  }
}

function normalizeNewEnergy(raw, legacyFallback = null) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const fallback = legacyFallback || emptyNewEnergy()
  const photoUrl = String(src.photoUrl || fallback.photoUrl || '').trim()
  const certNo = String(src.certNo || fallback.certNo || '').trim()
  const validUntil = String(src.validUntil || fallback.validUntil || '').trim()
  const enabledExplicit = src.enabled === true || src.enabled === 'true' || src.enabled === 1
  const enabled =
    enabledExplicit ||
    fallback.enabled ||
    Boolean(photoUrl) ||
    Boolean(certNo) ||
    Boolean(validUntil)

  return {
    enabled: Boolean(enabled),
    photoUrl: enabled ? photoUrl : '',
    certNo: enabled ? certNo : '',
    validUntil: enabled ? validUntil : '',
  }
}

/**
 * 归一化资质：
 * - baseType：一类/二类/三类/备案（必填）
 * - newEnergy：新能源专项（可选，可与基础并存）
 * - type / photoUrl / certNo / validUntil：镜像基础等级，兼容旧读方
 * - 旧数据 type=new_energy：迁入 newEnergy，baseType 为空待补填
 */
function normalizeQualification(raw = {}) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const legacyType = QUALIFICATION_TYPES.has(src.type) ? src.type : ''
  const legacyIsNewEnergyOnly = legacyType === 'new_energy'

  let baseType = BASE_QUALIFICATION_TYPES.has(src.baseType) ? src.baseType : ''
  if (!baseType && BASE_QUALIFICATION_TYPES.has(legacyType)) {
    baseType = legacyType
  }

  const specialtyFromList = normalizeStringArray(src.specialties).filter((item) =>
    SPECIALTY_QUALIFICATION_TYPES.has(item)
  )

  const legacyNewEnergyFallback = legacyIsNewEnergyOnly
    ? {
        enabled: true,
        photoUrl: String(src.photoUrl || '').trim(),
        certNo: String(src.certNo || '').trim(),
        validUntil: String(src.validUntil || '').trim(),
      }
    : specialtyFromList.includes('new_energy')
      ? { enabled: true, photoUrl: '', certNo: '', validUntil: '' }
      : null

  const newEnergy = normalizeNewEnergy(src.newEnergy, legacyNewEnergyFallback)

  const specialties = []
  if (newEnergy.enabled) {
    specialties.push('new_energy')
  }

  let photoUrl = String(src.photoUrl || '').trim()
  let certNo = String(src.certNo || '').trim()
  let validUntil = String(src.validUntil || '').trim()
  if (legacyIsNewEnergyOnly) {
    photoUrl = ''
    certNo = ''
    validUntil = ''
  }

  return {
    baseType,
    type: baseType || (legacyIsNewEnergyOnly ? 'new_energy' : ''),
    photoUrl,
    certNo,
    validUntil,
    specialties,
    newEnergy,
  }
}

function normalizePhotos(raw = {}) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const receptionUrls = normalizeStringArray(
    Array.isArray(src.receptionUrls)
      ? src.receptionUrls
      : src.receptionUrl
        ? [src.receptionUrl]
        : []
  ).slice(0, 6)
  const brandAuthItems = Array.isArray(src.brandAuthItems)
    ? src.brandAuthItems
    : []
  const legacyBrandAuthUrl = String(src.brandAuthUrl || '').trim()
  return {
    facadeUrl: String(src.facadeUrl || '').trim(),
    workshopUrls: normalizeStringArray(src.workshopUrls).slice(0, 6),
    receptionUrls,
    receptionUrl: receptionUrls[0] || '',
    brandAuthItems,
    brandAuthUrl: legacyBrandAuthUrl || String(brandAuthItems[0]?.imageUrl || '').trim(),
  }
}

function normalizeServices(services) {
  if (!Array.isArray(services)) return []
  return services
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 20)
}

function parseOnboardingForm(form = {}) {
  const storeName = String(form.storeName || '').trim()
  const contactName = String(form.contactName || '').trim()
  const phone = String(form.contactPhone || form.phone || '').trim()
  const storePhone = String(form.storePhone || form.phone || '').trim()
  const address = String(form.address || '').trim()
  const services = normalizeServices(form.services)
  const legalName = String(form.legalName || '').trim()
  const creditCode = String(form.creditCode || '').trim()
  const licensePhotoUrl = String(form.licensePhotoUrl || '').trim()
  const licenseEstablishedOn = normalizeLicenseEstablishedOn(
    form.licenseEstablishedOn || form.establishedOn || form.foundingDate
  )
  const contactEmail = String(form.contactEmail || '').trim()
  const businessHours = String(form.businessHours || '').trim()
  const intro = String(form.intro || '').trim()
  const latitude =
    form.latitude != null && form.latitude !== '' ? Number(form.latitude) : null
  const longitude =
    form.longitude != null && form.longitude !== '' ? Number(form.longitude) : null

  const newEnergyEnabled =
    form.newEnergyEnabled === true ||
    form.newEnergyEnabled === 'true' ||
    form.newEnergyEnabled === 1

  const qualification = normalizeQualification(
    form.qualification || {
      baseType: form.qualificationBaseType || form.qualificationType,
      type: form.qualificationType,
      photoUrl: form.qualificationPhotoUrl,
      certNo: form.qualificationNo,
      validUntil: form.qualificationValidUntil,
      specialties: newEnergyEnabled ? ['new_energy'] : [],
      newEnergy: {
        enabled: newEnergyEnabled,
        photoUrl: form.newEnergyPhotoUrl,
        certNo: form.newEnergyNo,
        validUntil: form.newEnergyValidUntil,
      },
    }
  )

  const photos = normalizePhotos(
    form.photos || {
      facadeUrl: form.facadePhotoUrl,
      workshopUrls: form.workshopPhotoUrls,
      receptionUrls: form.receptionPhotoUrls,
      receptionUrl: form.receptionPhotoUrl,
      brandAuthItems: form.brandAuthItems,
      brandAuthUrl: form.brandAuthPhotoUrl,
    }
  )

  return {
    storeName,
    contactName,
    phone,
    storePhone,
    address,
    services,
    legalName,
    creditCode,
    licensePhotoUrl,
    licenseEstablishedOn,
    contactEmail,
    businessHours,
    intro,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    qualification,
    photos,
  }
}

function assertPersistentOptional(url) {
  if (!url) return ''
  return assertPersistentImageUrl(url)
}

function sanitizePhotoPayload(photos) {
  const receptionUrls = normalizeStringArray(
    Array.isArray(photos.receptionUrls)
      ? photos.receptionUrls
      : photos.receptionUrl
        ? [photos.receptionUrl]
        : []
  )
    .map((u) => assertPersistentOptional(u))
    .filter(Boolean)
    .slice(0, 6)
  const brandAuthItems = normalizeBrandAuthItems(
    Array.isArray(photos.brandAuthItems) ? photos.brandAuthItems : []
  )
  const legacyBrandAuthUrl = assertPersistentOptional(
    photos.brandAuthUrl || brandAuthItems[0]?.imageUrl || ''
  )
  return {
    facadeUrl: assertPersistentOptional(photos.facadeUrl),
    workshopUrls: (photos.workshopUrls || [])
      .map((u) => assertPersistentOptional(u))
      .filter(Boolean)
      .slice(0, 6),
    receptionUrls,
    receptionUrl: receptionUrls[0] || '',
    brandAuthItems,
    brandAuthUrl: legacyBrandAuthUrl,
  }
}

function sanitizeQualificationPayload(qualification) {
  const q = normalizeQualification(qualification)
  const next = {
    ...q,
    photoUrl: q.photoUrl ? assertPersistentImageUrl(q.photoUrl) : '',
    newEnergy: {
      ...q.newEnergy,
      photoUrl: q.newEnergy.photoUrl
        ? assertPersistentImageUrl(q.newEnergy.photoUrl)
        : '',
    },
  }
  return next
}

/** 软信任：提交完善资料仅校验最少字段；证件/门头/资质为加分项 */
function validateBasicOnboardingPayload(payload) {
  if (!payload.storeName || !payload.contactName || !payload.phone) {
    const err = new Error('请填写门店名称、负责人与手机')
    err.status = 400
    throw err
  }
  const phoneDigits = String(payload.phone || '').replace(/\D/g, '')
  if (phoneDigits.length !== 11) {
    const err = new Error('请填写正确的负责人手机号')
    err.status = 400
    throw err
  }
  const q = normalizeQualification(payload.qualification)
  if (q.newEnergy.enabled && !q.newEnergy.photoUrl) {
    const err = new Error('请上传新能源专项资质照片')
    err.status = 400
    throw err
  }

  const photos = sanitizePhotoPayload(payload.photos)

  return {
    ...payload,
    phone: phoneDigits,
    licensePhotoUrl: assertPersistentOptional(payload.licensePhotoUrl),
    qualification: sanitizeQualificationPayload(q),
    photos,
  }
}

function validateSubmitPayload(payload) {
  return validateBasicOnboardingPayload(payload)
}

function optionalBoolean(value) {
  if (value === true || value === false) return value
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function parseStoreDisplayForm(form = {}) {
  const photos = normalizePhotos(
    form.photos || {
      facadeUrl: form.facadePhotoUrl,
      workshopUrls: form.workshopPhotoUrls,
      receptionUrls: form.receptionPhotoUrls,
      receptionUrl: form.receptionPhotoUrl,
      brandAuthItems: form.brandAuthItems,
      brandAuthUrl: form.brandAuthPhotoUrl,
    }
  )
  if (Array.isArray(form.brandAuthItems)) {
    photos.brandAuthItems = normalizeBrandAuthItems(form.brandAuthItems)
    photos.brandAuthUrl = photos.brandAuthItems[0]?.imageUrl || photos.brandAuthUrl || ''
  }

  const identityProvided = form.storeName != null
  const latitude = form.latitude === '' || form.latitude == null ? null : Number(form.latitude)
  const longitude = form.longitude === '' || form.longitude == null ? null : Number(form.longitude)

  return {
    identityProvided,
    storeName: identityProvided ? String(form.storeName || '').trim() : null,
    address: form.address == null ? null : String(form.address || '').trim(),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    contactName: form.contactName == null ? null : String(form.contactName || '').trim(),
    contactPhone:
      form.phone == null && form.contactPhone == null
        ? null
        : String(form.phone || form.contactPhone || '').replace(/\D/g, ''),
    legalName: form.legalName == null ? null : String(form.legalName || '').trim(),
    creditCode: form.creditCode == null ? null : String(form.creditCode || '').trim(),
    licensePhotoUrl:
      form.licensePhotoUrl == null ? null : String(form.licensePhotoUrl || '').trim(),
    legalIdPhotoUrl:
      form.legalIdPhotoUrl == null ? null : String(form.legalIdPhotoUrl || '').trim(),
    licenseEstablishedOn:
      form.licenseEstablishedOn == null ? null : String(form.licenseEstablishedOn || '').trim(),
    contactEmail: form.contactEmail == null ? null : String(form.contactEmail || '').trim(),
    qualification:
      form.qualification && typeof form.qualification === 'object' ? form.qualification : null,
    publishLicense: optionalBoolean(form.publishLicense),
    publishQualification: optionalBoolean(form.publishQualification),
    storePhone: String(form.storePhone || '').trim(),
    businessHours: String(form.businessHours || '').trim(),
    intro: String(form.intro || '').trim(),
    services: normalizeServices(form.services),
    brandAuthItems: photos.brandAuthItems,
    brandAuthValidUntil:
      earliestBrandAuthValidUntil(photos.brandAuthItems) ||
      String(form.brandAuthValidUntil || '').trim(),
    photos,
  }
}

/** 开通后商家自维护的门店资料。店名必填；电话、照片、擅长为加分项。 */
function validateStoreDisplayPayload(payload) {
  if (payload.identityProvided && !payload.storeName) {
    const err = new Error('请填写门店名称')
    err.status = 400
    throw err
  }
  if (payload.contactPhone && !/^\d{11}$/.test(payload.contactPhone)) {
    const err = new Error('请填写正确的负责人手机号')
    err.status = 400
    throw err
  }

  let qualification = payload.qualification
  if (qualification) {
    qualification = sanitizeQualificationPayload(qualification)
    if (qualification.newEnergy && qualification.newEnergy.enabled && !qualification.newEnergy.photoUrl) {
      const err = new Error('请上传新能源专项资质照片')
      err.status = 400
      throw err
    }
  }

  const photos = sanitizePhotoPayload(payload.photos)
  if (payload.publishLicense !== null) photos.publishLicense = payload.publishLicense
  if (payload.publishQualification !== null) {
    photos.publishQualification = payload.publishQualification
  }
  if (payload.licensePhotoUrl) {
    payload.licensePhotoUrl = assertPersistentOptional(payload.licensePhotoUrl)
  }
  if (payload.legalIdPhotoUrl) {
    payload.legalIdPhotoUrl = assertPersistentOptional(payload.legalIdPhotoUrl)
  }

  return {
    ...payload,
    qualification,
    photos,
  }
}

function formatQualificationForClient(json) {
  const q = normalizeQualification(json)
  const baseTypeLabel = QUALIFICATION_LABELS[q.baseType] || ''
  const typeLabel =
    baseTypeLabel ||
    QUALIFICATION_LABELS[q.type] ||
    q.type ||
    '—'
  const specialtyLabels = q.specialties
    .map((item) => QUALIFICATION_LABELS[item])
    .filter(Boolean)

  return {
    ...q,
    typeLabel,
    baseTypeLabel,
    specialtyLabels,
    newEnergy: {
      ...q.newEnergy,
      typeLabel: QUALIFICATION_LABELS.new_energy,
    },
  }
}

/** 从资质 JSON 生成门店头标标签 */
function buildQualificationTags(json) {
  const q = normalizeQualification(json)
  const tags = []
  if (q.baseType && QUALIFICATION_TAG_LABELS[q.baseType]) {
    tags.push(QUALIFICATION_TAG_LABELS[q.baseType])
  } else if (q.type === 'new_energy') {
    tags.push(QUALIFICATION_TAG_LABELS.new_energy)
  }
  if (q.newEnergy.enabled && QUALIFICATION_TAG_LABELS.new_energy) {
    if (!tags.includes(QUALIFICATION_TAG_LABELS.new_energy)) {
      tags.push(QUALIFICATION_TAG_LABELS.new_energy)
    }
  }
  return tags
}

function formatPhotosForClient(json) {
  return normalizePhotos(json)
}

module.exports = {
  BASE_QUALIFICATION_TYPES,
  SPECIALTY_QUALIFICATION_TYPES,
  QUALIFICATION_TYPES,
  QUALIFICATION_LABELS,
  QUALIFICATION_TAG_LABELS,
  parseOnboardingForm,
  parseStoreDisplayForm,
  validateBasicOnboardingPayload,
  validateSubmitPayload,
  validateStoreDisplayPayload,
  formatQualificationForClient,
  buildQualificationTags,
  formatPhotosForClient,
  normalizeServices,
  normalizeQualification,
}
