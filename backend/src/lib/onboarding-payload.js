const { assertPersistentImageUrl } = require('./media-storage')

const QUALIFICATION_TYPES = new Set([
  'class_1',
  'class_2',
  'class_3',
  'record',
  'new_energy',
])

const QUALIFICATION_LABELS = {
  class_1: '一类机动车维修',
  class_2: '二类机动车维修',
  class_3: '三类机动车维修',
  record: '维修经营备案',
  new_energy: '新能源专项资质',
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.map((s) => String(s).trim()).filter(Boolean)
}

function normalizeQualification(raw = {}) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    type: QUALIFICATION_TYPES.has(src.type) ? src.type : '',
    photoUrl: String(src.photoUrl || '').trim(),
    certNo: String(src.certNo || '').trim(),
    validUntil: String(src.validUntil || '').trim(),
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

  const qualification = normalizeQualification(form.qualification || {
    type: form.qualificationType,
    photoUrl: form.qualificationPhotoUrl,
    certNo: form.qualificationNo,
    validUntil: form.qualificationValidUntil,
  })

  const photos = normalizePhotos(form.photos || {
    facadeUrl: form.facadePhotoUrl,
    workshopUrls: form.workshopPhotoUrls,
    receptionUrl: form.receptionPhotoUrl,
    brandAuthUrl: form.brandAuthPhotoUrl,
  })

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

function validateSubmitPayload(payload) {
  if (!payload.storeName || !payload.contactName || !payload.phone || !payload.address) {
    const err = new Error('请填写完整入驻信息')
    err.status = 400
    throw err
  }
  if (!payload.services.length) {
    const err = new Error('请至少选择一项擅长服务')
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
  if (!payload.businessHours) {
    const err = new Error('请填写营业时间')
    err.status = 400
    throw err
  }
  if (!payload.storePhone) {
    const err = new Error('请填写门店电话')
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
  if (!payload.qualification.type || !payload.qualification.photoUrl) {
    const err = new Error('请填写维修资质类型并上传资质照片')
    err.status = 400
    throw err
  }

  return {
    ...payload,
    licensePhotoUrl: assertPersistentImageUrl(payload.licensePhotoUrl),
    qualification: {
      ...payload.qualification,
      photoUrl: assertPersistentImageUrl(payload.qualification.photoUrl),
    },
    photos: sanitizePhotoPayload(payload.photos),
  }
}

function formatQualificationForClient(json) {
  const q = normalizeQualification(json)
  return {
    ...q,
    typeLabel: QUALIFICATION_LABELS[q.type] || q.type || '—',
  }
}

function formatPhotosForClient(json) {
  return normalizePhotos(json)
}

module.exports = {
  QUALIFICATION_TYPES,
  QUALIFICATION_LABELS,
  parseOnboardingForm,
  validateSubmitPayload,
  formatQualificationForClient,
  formatPhotosForClient,
  normalizeServices,
}
