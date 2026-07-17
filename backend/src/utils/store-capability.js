/**
 * 门店能力资产（卷十一 STORE-ASSET）
 * capabilityJson：即时字段 + 已审公开 + 待审快照
 */

const { assertPersistentImageUrl } = require('../lib/media-storage')
const { formatShanghaiDate } = require('../lib/shanghai-date')

const EQUIPMENT_TAG_PRESETS = [
  '烤漆房',
  '四轮定位',
  '诊断电脑',
  '新能源工位',
  '举升机',
  '轮胎动平衡',
  '空调冷媒机',
]

function normalizeStringArray(value, max = 20) {
  if (!Array.isArray(value)) return []
  return value
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .slice(0, max)
}

function normalizeTechnician(raw = {}, index = 0) {
  const credentials = normalizeStringArray(raw.credentials || raw.tags, 8)
  const name = String(raw.name || '').trim()
  if (!name) return null
  return {
    id: String(raw.id || `tech_${index + 1}`).trim(),
    name: name.slice(0, 32),
    role: String(raw.role || '维修技师').trim().slice(0, 32) || '维修技师',
    years: String(raw.years || '').trim().slice(0, 16),
    credentials,
  }
}

function normalizeTechnicians(list) {
  if (!Array.isArray(list)) return []
  return list.map((item, i) => normalizeTechnician(item, i)).filter(Boolean).slice(0, 12)
}

function normalizeEquipmentTag(raw = {}, index = 0) {
  const label = String(raw.label || raw.name || '').trim()
  if (!label) return null
  let imageUrl = String(raw.imageUrl || '').trim()
  if (imageUrl) {
    try {
      imageUrl = assertPersistentImageUrl(imageUrl)
    } catch (_) {
      imageUrl = ''
    }
  }
  return {
    id: String(raw.id || `eq_${index + 1}`).trim(),
    label: label.slice(0, 32),
    imageUrl,
  }
}

function normalizeEquipmentTags(list) {
  if (!Array.isArray(list)) return []
  return list.map((item, i) => normalizeEquipmentTag(item, i)).filter(Boolean).slice(0, 16)
}

function emptyCapability() {
  return {
    specialtyBrands: [],
    notAccepting: [],
    technicians: [],
    equipmentTags: [],
    brandAuthValidUntil: '',
    bookingPaused: false,
    reviewStatus: 'none',
    lastProfileVerifiedAt: '',
    pending: null,
  }
}

function readCapabilityJson(raw) {
  const base = emptyCapability()
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    specialtyBrands: normalizeStringArray(src.specialtyBrands, 20),
    notAccepting: normalizeStringArray(src.notAccepting, 12),
    technicians: normalizeTechnicians(src.technicians),
    equipmentTags: normalizeEquipmentTags(src.equipmentTags),
    brandAuthValidUntil: String(src.brandAuthValidUntil || '').trim(),
    bookingPaused: src.bookingPaused === true,
    reviewStatus: ['none', 'pending', 'rejected'].includes(src.reviewStatus)
      ? src.reviewStatus
      : 'none',
    lastProfileVerifiedAt: String(src.lastProfileVerifiedAt || '').trim(),
    pending: src.pending && typeof src.pending === 'object' ? src.pending : null,
  }
}

function isDateExpired(isoDate, today = formatShanghaiDate()) {
  const d = String(isoDate || '').trim()
  if (!d) return false
  return d < today
}

/** 有效期状态：none | ok | expiring(≤30天) | expired */
function resolveValidUntilState(isoDate, today = formatShanghaiDate()) {
  const until = String(isoDate || '').trim()
  if (!until) return { status: 'none', daysLeft: null, validUntil: '' }
  const start = new Date(`${today}T12:00:00+08:00`)
  const end = new Date(`${until}T12:00:00+08:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { status: 'none', daysLeft: null, validUntil: until }
  }
  const daysLeft = Math.floor((end - start) / (24 * 3600 * 1000))
  if (daysLeft < 0) return { status: 'expired', daysLeft, validUntil: until }
  if (daysLeft <= 30) return { status: 'expiring', daysLeft, validUntil: until }
  return { status: 'ok', daysLeft, validUntil: until }
}

const LIST_SCORE_PENALTY = {
  expired: 25,
  expiring: 8,
}

/**
 * 公开列表轻降权（不对用户展示文案）
 * @returns {number} 应从 score 扣除的分值
 */
function computeStoreListScorePenalty(
  { brandAuthValidUntil = '', qualificationValidUntil = '' } = {},
  today = formatShanghaiDate()
) {
  let penalty = 0
  for (const until of [brandAuthValidUntil, qualificationValidUntil]) {
    const state = resolveValidUntilState(until, today)
    if (state.status === 'expired') penalty += LIST_SCORE_PENALTY.expired
    else if (state.status === 'expiring') penalty += LIST_SCORE_PENALTY.expiring
  }
  return penalty
}

/** 已审设备实景图 URL 列表（公开面） */
function collectApprovedEquipmentImageUrls(publicCapability) {
  const tags =
    publicCapability && Array.isArray(publicCapability.equipmentTags)
      ? publicCapability.equipmentTags
      : []
  return tags.map((t) => String(t.imageUrl || '').trim()).filter(Boolean)
}

function brandAuthIsPublic(capability, brandAuthUrl, today = formatShanghaiDate()) {
  const url = String(brandAuthUrl || '').trim()
  if (!url) return false
  const until = capability.brandAuthValidUntil
  if (until && isDateExpired(until, today)) return false
  // 有待审品牌授权变更时，公开仍用已通过的 validUntil；URL 以 photos 已落库为准
  return true
}

function capabilityNeedsReview(nextPending, prev) {
  if (!nextPending) return false
  const techChanged =
    JSON.stringify(nextPending.technicians || []) !== JSON.stringify(prev.technicians || [])
  const eqChanged =
    JSON.stringify(nextPending.equipmentTags || []) !== JSON.stringify(prev.equipmentTags || [])
  const authChanged =
    String(nextPending.brandAuthUrl || '') !== String(nextPending.prevBrandAuthUrl || '') ||
    String(nextPending.brandAuthValidUntil || '') !== String(prev.brandAuthValidUntil || '')
  return techChanged || eqChanged || authChanged
}

/**
 * 合并商家提交：即时字段直接写；须审字段进入 pending
 */
function mergeCapabilityFromMerchantEdit(prevRaw, form = {}, photos = {}) {
  const prev = readCapabilityJson(prevRaw)
  const specialtyBrands = normalizeStringArray(
    form.specialtyBrands != null ? form.specialtyBrands : prev.specialtyBrands,
    20
  )
  const notAccepting = normalizeStringArray(
    form.notAccepting != null ? form.notAccepting : prev.notAccepting,
    12
  )

  const submittedTechnicians =
    form.technicians != null ? normalizeTechnicians(form.technicians) : prev.technicians
  const submittedEquipment =
    form.equipmentTags != null ? normalizeEquipmentTags(form.equipmentTags) : prev.equipmentTags
  const brandAuthUrl = String(photos.brandAuthUrl || form.brandAuthPhotoUrl || '').trim()
  const brandAuthValidUntil = String(
    form.brandAuthValidUntil != null ? form.brandAuthValidUntil : prev.brandAuthValidUntil
  ).trim()

  const prevBrandAuthUrl = String(form.prevBrandAuthUrl || photos._prevBrandAuthUrl || '').trim()

  const reviewPayload = {
    submittedAt: new Date().toISOString(),
    technicians: submittedTechnicians,
    equipmentTags: submittedEquipment,
    brandAuthUrl,
    brandAuthValidUntil,
    prevBrandAuthUrl,
  }

  const techChanged =
    JSON.stringify(submittedTechnicians) !== JSON.stringify(prev.technicians || [])
  const eqChanged =
    JSON.stringify(submittedEquipment) !== JSON.stringify(prev.equipmentTags || [])
  const authUntilChanged = brandAuthValidUntil !== String(prev.brandAuthValidUntil || '')
  // 品牌授权图变化由调用方传入 prevBrandAuthUrl 比较；若未传则仅看 validUntil + 有图
  const authUrlChanged =
    form.brandAuthChanged === true ||
    (prevBrandAuthUrl && brandAuthUrl !== prevBrandAuthUrl)

  const needsReview = techChanged || eqChanged || authUntilChanged || authUrlChanged

  const next = {
    ...prev,
    specialtyBrands,
    notAccepting,
    bookingPaused: form.bookingPaused === true ? true : prev.bookingPaused,
  }

  if (needsReview) {
    next.pending = reviewPayload
    next.reviewStatus = 'pending'
  }

  return { capability: next, needsReview }
}

function approveCapabilityPending(prevRaw, options = {}) {
  const prev = readCapabilityJson(prevRaw)
  const pending = prev.pending
  if (!pending) {
    return { capability: prev, brandAuthUrl: null }
  }
  const today = formatShanghaiDate()
  const next = {
    ...prev,
    technicians: normalizeTechnicians(pending.technicians),
    equipmentTags: normalizeEquipmentTags(pending.equipmentTags),
    brandAuthValidUntil: String(pending.brandAuthValidUntil || '').trim(),
    pending: null,
    reviewStatus: 'none',
    lastProfileVerifiedAt: options.verifiedAt || today,
  }
  return {
    capability: next,
    brandAuthUrl: String(pending.brandAuthUrl || '').trim() || null,
  }
}

function rejectCapabilityPending(prevRaw, reason = '') {
  const prev = readCapabilityJson(prevRaw)
  return {
    ...prev,
    reviewStatus: 'rejected',
    pending: prev.pending
      ? { ...prev.pending, rejectReason: String(reason || '').trim().slice(0, 200) }
      : null,
  }
}

function buildPublicCapabilityView(capabilityRaw, photos = {}, options = {}) {
  const capability = readCapabilityJson(capabilityRaw)
  const today = options.today || formatShanghaiDate()
  const brandAuthUrl = String(photos.brandAuthUrl || '').trim()
  const showBrandAuth = Boolean(
    brandAuthUrl && !isDateExpired(capability.brandAuthValidUntil, today)
  )

  return {
    specialtyBrands: capability.specialtyBrands,
    notAccepting: capability.notAccepting,
    techniciansPublic: capability.technicians.map((t) => ({
      id: t.id,
      name: t.name,
      role: t.role,
      years: t.years,
      credentials: t.credentials,
    })),
    equipmentTags: capability.equipmentTags,
    brandAuth: showBrandAuth
      ? {
          verified: true,
          validUntil: capability.brandAuthValidUntil || '',
          imageUrl: brandAuthUrl,
        }
      : null,
    lastProfileVerifiedAt: capability.lastProfileVerifiedAt || '',
    reviewStatus: capability.reviewStatus,
  }
}

function buildMerchantCapabilityEditorView(capabilityRaw, photos = {}) {
  const capability = readCapabilityJson(capabilityRaw)
  const pending = capability.pending
  return {
    specialtyBrands: capability.specialtyBrands,
    notAccepting: capability.notAccepting,
    technicians: pending?.technicians || capability.technicians,
    equipmentTags: pending?.equipmentTags || capability.equipmentTags,
    brandAuthValidUntil: pending?.brandAuthValidUntil || capability.brandAuthValidUntil,
    brandAuthPhotoUrl: String(photos.brandAuthUrl || '').trim(),
    reviewStatus: capability.reviewStatus,
    rejectReason: pending?.rejectReason || '',
    publishedTechnicians: capability.technicians,
    publishedEquipmentTags: capability.equipmentTags,
    lastProfileVerifiedAt: capability.lastProfileVerifiedAt,
  }
}

module.exports = {
  EQUIPMENT_TAG_PRESETS,
  LIST_SCORE_PENALTY,
  emptyCapability,
  readCapabilityJson,
  mergeCapabilityFromMerchantEdit,
  approveCapabilityPending,
  rejectCapabilityPending,
  buildPublicCapabilityView,
  buildMerchantCapabilityEditorView,
  isDateExpired,
  resolveValidUntilState,
  computeStoreListScorePenalty,
  collectApprovedEquipmentImageUrls,
  brandAuthIsPublic,
  capabilityNeedsReview,
  normalizeTechnicians,
  normalizeEquipmentTags,
  normalizeStringArray,
}
