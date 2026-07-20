const { assertPersistentImageUrl } = require('./media-storage')

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
  return {
    facadeUrl: String(src.facadeUrl || '').trim(),
    workshopUrls: normalizeStringArray(src.workshopUrls),
    receptionUrl: String(src.receptionUrl || '').trim(),
    brandAuthUrl: String(src.brandAuthUrl || '').trim(),
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
      receptionUrl: form.receptionPhotoUrl,
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
  return {
    facadeUrl: assertPersistentOptional(photos.facadeUrl),
    workshopUrls: photos.workshopUrls.map((u) => assertPersistentOptional(u)).filter(Boolean),
    receptionUrl: assertPersistentOptional(photos.receptionUrl),
    brandAuthUrl: assertPersistentOptional(photos.brandAuthUrl),
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

/** 入驻提交：仅校验基本资料（主体/资质/门店标识），其他资料可审核后完善 */
function validateBasicOnboardingPayload(payload) {
  if (!payload.storeName || !payload.contactName || !payload.phone || !payload.address) {
    const err = new Error('请填写完整入驻信息')
    err.status = 400
    throw err
  }
  if (!payload.legalName || !payload.creditCode) {
    const err = new Error('请填写商家主体名称与统一社会信用代码')
    err.status = 400
    throw err
  }
  if (!payload.licensePhotoUrl) {
    const err = new Error('请上传营业执照照片')
    err.status = 400
    throw err
  }
  if (payload.latitude == null || payload.longitude == null) {
    const err = new Error('请在地图上选择门店位置')
    err.status = 400
    throw err
  }

  const q = normalizeQualification(payload.qualification)
  if (!q.baseType || !q.photoUrl) {
    const err = new Error('请填写基础维修资质类型并上传资质照片')
    err.status = 400
    throw err
  }
  if (q.newEnergy.enabled && !q.newEnergy.photoUrl) {
    const err = new Error('请上传新能源专项资质照片')
    err.status = 400
    throw err
  }

  const photos = sanitizePhotoPayload(payload.photos)

  return {
    ...payload,
    licensePhotoUrl: assertPersistentImageUrl(payload.licensePhotoUrl),
    qualification: sanitizeQualificationPayload(q),
    photos,
  }
}

function validateSubmitPayload(payload) {
  return validateBasicOnboardingPayload(payload)
}

function parseStoreDisplayForm(form = {}) {
  const photos = normalizePhotos(
    form.photos || {
      facadeUrl: form.facadePhotoUrl,
      workshopUrls: form.workshopPhotoUrls,
      receptionUrl: form.receptionPhotoUrl,
      brandAuthUrl: form.brandAuthPhotoUrl,
    }
  )

  return {
    storePhone: String(form.storePhone || '').trim(),
    businessHours: String(form.businessHours || '').trim(),
    intro: String(form.intro || '').trim(),
    services: normalizeServices(form.services),
    photos,
  }
}

/** 审核通过后商家自维护的展示资料 */
function validateStoreDisplayPayload(payload) {
  if (!payload.storePhone) {
    const err = new Error('请填写门店电话')
    err.status = 400
    throw err
  }
  if (!payload.businessHours) {
    const err = new Error('请填写营业时间')
    err.status = 400
    throw err
  }
  if (!payload.services.length) {
    const err = new Error('请至少选择一项擅长服务')
    err.status = 400
    throw err
  }
  if (!payload.photos.facadeUrl) {
    const err = new Error('请上传门头照片')
    err.status = 400
    throw err
  }
  if (!payload.photos.workshopUrls.length) {
    const err = new Error('请至少上传一张工位照片')
    err.status = 400
    throw err
  }

  return {
    ...payload,
    photos: sanitizePhotoPayload(payload.photos),
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
