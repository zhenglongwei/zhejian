/**
 * 门店能力资产（卷十一 STORE-ASSET）
 * capabilityJson：即时字段 + 已审公开 + 待审快照
 */

const { assertPersistentImageUrl, resolveClientReadableMediaUrl } = require('../lib/media-storage')
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

const BRAND_AUTH_ITEM_MAX = 8

function normalizeStringArray(value, max = 20) {
  if (!Array.isArray(value)) return []
  return value
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .slice(0, max)
}

function persistOptionalImageUrl(url) {
  const value = String(url || '').trim()
  if (!value) return ''
  try {
    return assertPersistentImageUrl(value)
  } catch (_) {
    return ''
  }
}

function normalizeTechnician(raw = {}, index = 0) {
  const credentials = normalizeStringArray(raw.credentials || raw.tags, 8)
  const name = String(raw.name || '').trim()
  if (!name) return null
  const avatarUrl = persistOptionalImageUrl(raw.avatarUrl || raw.photoUrl || raw.avatar)
  const credentialPhotoUrls = normalizeStringArray(
    Array.isArray(raw.credentialPhotoUrls)
      ? raw.credentialPhotoUrls
      : raw.credentialPhotoUrl
        ? [raw.credentialPhotoUrl]
        : [],
    6
  )
    .map((url) => persistOptionalImageUrl(url))
    .filter(Boolean)
  return {
    id: String(raw.id || `tech_${index + 1}`).trim(),
    name: name.slice(0, 32),
    role: String(raw.role || '维修技师').trim().slice(0, 32) || '维修技师',
    years: String(raw.years || '').trim().slice(0, 16),
    credentials,
    avatarUrl,
    credentialPhotoUrls,
  }
}

function normalizeTechnicians(list) {
  if (!Array.isArray(list)) return []
  return list.map((item, i) => normalizeTechnician(item, i)).filter(Boolean)
}

function normalizeEquipmentTag(raw = {}, index = 0) {
  const label = String(raw.label || raw.name || '').trim()
  if (!label) return null
  const imageUrl = persistOptionalImageUrl(raw.imageUrl)
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

/**
 * 单条品牌授权：品牌名 + 证明图 + 有效期
 * 无品牌名且无图则丢弃；有图无品牌名时品牌名回落为「品牌授权」
 */
function normalizeBrandAuthItem(raw = {}, index = 0) {
  if (!raw || typeof raw !== 'object') return null
  const brandName = String(raw.brandName || raw.name || raw.brand || '').trim().slice(0, 32)
  const imageUrl = persistOptionalImageUrl(raw.imageUrl || raw.url || raw.photoUrl)
  const validUntil = String(raw.validUntil || raw.brandAuthValidUntil || '').trim().slice(0, 16)
  if (!imageUrl && !brandName) return null
  if (!imageUrl) return null
  return {
    id: String(raw.id || `brand_auth_${index + 1}`).trim().slice(0, 40),
    brandName: brandName || '品牌授权',
    imageUrl,
    validUntil,
  }
}

function normalizeBrandAuthItems(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((item, i) => normalizeBrandAuthItem(item, i))
    .filter(Boolean)
    .slice(0, BRAND_AUTH_ITEM_MAX)
}

/** 读 photosJson / pending：兼容旧 brandAuthUrl + brandAuthValidUntil */
function readBrandAuthItemsFromPhotos(photos = {}, fallbackValidUntil = '') {
  const src = photos && typeof photos === 'object' && !Array.isArray(photos) ? photos : {}
  if (Array.isArray(src.brandAuthItems) && src.brandAuthItems.length) {
    return normalizeBrandAuthItems(src.brandAuthItems)
  }
  const legacyUrl = String(src.brandAuthUrl || '').trim()
  if (!legacyUrl) return []
  return normalizeBrandAuthItems([
    {
      id: 'brand_auth_1',
      brandName: '品牌授权',
      imageUrl: legacyUrl,
      validUntil: String(src.brandAuthValidUntil || fallbackValidUntil || '').trim(),
    },
  ])
}

function brandAuthItemsSignature(list) {
  return JSON.stringify(
    normalizeBrandAuthItems(list).map((item) => ({
      id: item.id,
      brandName: item.brandName,
      imageUrl: item.imageUrl,
      validUntil: item.validUntil,
    }))
  )
}

function earliestBrandAuthValidUntil(items) {
  const dates = normalizeBrandAuthItems(items)
    .map((item) => item.validUntil)
    .filter(Boolean)
    .sort()
  return dates[0] || ''
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
 * brandAuthValidUntil 可为单值；若传入 brandAuthItems 则按各条累计最差后再封顶（同旧：过期/临期各计一次取最严重）
 */
function computeStoreListScorePenalty(
  { brandAuthValidUntil = '', qualificationValidUntil = '', brandAuthItems } = {},
  today = formatShanghaiDate()
) {
  let penalty = 0
  const authUntils = Array.isArray(brandAuthItems)
    ? normalizeBrandAuthItems(brandAuthItems).map((item) => item.validUntil).filter(Boolean)
    : brandAuthValidUntil
      ? [brandAuthValidUntil]
      : []
  let authPenalty = 0
  for (const until of authUntils) {
    const state = resolveValidUntilState(until, today)
    if (state.status === 'expired') authPenalty = Math.max(authPenalty, LIST_SCORE_PENALTY.expired)
    else if (state.status === 'expiring') {
      authPenalty = Math.max(authPenalty, LIST_SCORE_PENALTY.expiring)
    }
  }
  penalty += authPenalty
  const qualState = resolveValidUntilState(qualificationValidUntil, today)
  if (qualState.status === 'expired') penalty += LIST_SCORE_PENALTY.expired
  else if (qualState.status === 'expiring') penalty += LIST_SCORE_PENALTY.expiring
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

function filterPublicBrandAuthItems(items, today = formatShanghaiDate()) {
  return normalizeBrandAuthItems(items).filter((item) => {
    if (!item.imageUrl) return false
    if (item.validUntil && isDateExpired(item.validUntil, today)) return false
    return true
  })
}

function brandAuthIsPublic(capability, brandAuthUrl, today = formatShanghaiDate()) {
  const url = String(brandAuthUrl || '').trim()
  if (!url) return false
  const until = capability.brandAuthValidUntil
  if (until && isDateExpired(until, today)) return false
  return true
}

function capabilityNeedsReview(nextPending, prev) {
  if (!nextPending) return false
  const techChanged =
    JSON.stringify(nextPending.technicians || []) !== JSON.stringify(prev.technicians || [])
  const eqChanged =
    JSON.stringify(nextPending.equipmentTags || []) !== JSON.stringify(prev.equipmentTags || [])
  const authChanged =
    brandAuthItemsSignature(nextPending.brandAuthItems) !==
      brandAuthItemsSignature(
        nextPending.prevBrandAuthItems ||
          (nextPending.prevBrandAuthUrl
            ? [
                {
                  id: 'brand_auth_1',
                  brandName: '品牌授权',
                  imageUrl: nextPending.prevBrandAuthUrl,
                  validUntil: prev.brandAuthValidUntil,
                },
              ]
            : [])
      )
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

  const publishedBrandAuthItems = readBrandAuthItemsFromPhotos(photos, prev.brandAuthValidUntil)
  let submittedBrandAuthItems = publishedBrandAuthItems
  if (form.brandAuthItems != null) {
    submittedBrandAuthItems = normalizeBrandAuthItems(form.brandAuthItems)
  } else if (photos.brandAuthItems != null || form.brandAuthPhotoUrl || photos.brandAuthUrl) {
    submittedBrandAuthItems = readBrandAuthItemsFromPhotos(
      {
        brandAuthItems: form.brandAuthItems || photos.brandAuthItems,
        brandAuthUrl: form.brandAuthPhotoUrl || photos.brandAuthUrl,
        brandAuthValidUntil: form.brandAuthValidUntil,
      },
      form.brandAuthValidUntil || prev.brandAuthValidUntil
    )
  }

  const reviewPayload = {
    submittedAt: new Date().toISOString(),
    technicians: submittedTechnicians,
    equipmentTags: submittedEquipment,
    brandAuthItems: submittedBrandAuthItems,
    // 兼容旧运营台字段
    brandAuthUrl: submittedBrandAuthItems[0]?.imageUrl || '',
    brandAuthValidUntil:
      earliestBrandAuthValidUntil(submittedBrandAuthItems) ||
      String(form.brandAuthValidUntil || prev.brandAuthValidUntil || '').trim(),
    prevBrandAuthItems: publishedBrandAuthItems,
    prevBrandAuthUrl: publishedBrandAuthItems[0]?.imageUrl || '',
  }

  const techChanged =
    JSON.stringify(submittedTechnicians) !== JSON.stringify(prev.technicians || [])
  const eqChanged =
    JSON.stringify(submittedEquipment) !== JSON.stringify(prev.equipmentTags || [])
  const authChanged =
    brandAuthItemsSignature(submittedBrandAuthItems) !==
    brandAuthItemsSignature(publishedBrandAuthItems)

  const needsReview = techChanged || eqChanged || authChanged

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
    return { capability: prev, brandAuthUrl: null, brandAuthItems: null }
  }
  const today = formatShanghaiDate()
  const brandAuthItems = normalizeBrandAuthItems(
    pending.brandAuthItems ||
      (pending.brandAuthUrl
        ? [
            {
              id: 'brand_auth_1',
              brandName: '品牌授权',
              imageUrl: pending.brandAuthUrl,
              validUntil: pending.brandAuthValidUntil,
            },
          ]
        : [])
  )
  const next = {
    ...prev,
    technicians: normalizeTechnicians(pending.technicians),
    equipmentTags: normalizeEquipmentTags(pending.equipmentTags),
    brandAuthValidUntil:
      earliestBrandAuthValidUntil(brandAuthItems) ||
      String(pending.brandAuthValidUntil || '').trim(),
    pending: null,
    reviewStatus: 'none',
    lastProfileVerifiedAt: options.verifiedAt || today,
  }
  return {
    capability: next,
    brandAuthUrl: brandAuthItems[0]?.imageUrl || null,
    brandAuthItems,
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
  const publishedItems = readBrandAuthItemsFromPhotos(photos, capability.brandAuthValidUntil)
  const publicItems = filterPublicBrandAuthItems(publishedItems, today)
  const first = publicItems[0] || null

  return {
    specialtyBrands: capability.specialtyBrands,
    notAccepting: capability.notAccepting,
    techniciansPublic: capability.technicians.map((t) => ({
      id: t.id,
      name: t.name,
      role: t.role,
      years: t.years,
      credentials: t.credentials,
      avatarUrl: resolveClientReadableMediaUrl(t.avatarUrl || ''),
      credentialPhotoUrls: (t.credentialPhotoUrls || [])
        .map((url) => resolveClientReadableMediaUrl(url))
        .filter(Boolean),
    })),
    equipmentTags: capability.equipmentTags,
    brandAuthItems: publicItems,
    brandAuth: first
      ? {
          verified: true,
          validUntil: first.validUntil || '',
          imageUrl: first.imageUrl,
          brandName: first.brandName || '品牌授权',
        }
      : null,
    lastProfileVerifiedAt: capability.lastProfileVerifiedAt || '',
    reviewStatus: capability.reviewStatus,
  }
}

function buildMerchantCapabilityEditorView(capabilityRaw, photos = {}) {
  const capability = readCapabilityJson(capabilityRaw)
  const pending = capability.pending
  const publishedItems = readBrandAuthItemsFromPhotos(photos, capability.brandAuthValidUntil)
  const editorItems = pending?.brandAuthItems
    ? normalizeBrandAuthItems(pending.brandAuthItems)
    : pending?.brandAuthUrl
      ? normalizeBrandAuthItems([
          {
            id: 'brand_auth_1',
            brandName: '品牌授权',
            imageUrl: pending.brandAuthUrl,
            validUntil: pending.brandAuthValidUntil || capability.brandAuthValidUntil,
          },
        ])
      : publishedItems

  return {
    specialtyBrands: capability.specialtyBrands,
    notAccepting: capability.notAccepting,
    technicians: pending?.technicians || capability.technicians,
    equipmentTags: pending?.equipmentTags || capability.equipmentTags,
    brandAuthItems: editorItems,
    brandAuthValidUntil:
      earliestBrandAuthValidUntil(editorItems) ||
      pending?.brandAuthValidUntil ||
      capability.brandAuthValidUntil,
    brandAuthPhotoUrl: editorItems[0]?.imageUrl || '',
    reviewStatus: capability.reviewStatus,
    rejectReason: pending?.rejectReason || '',
    publishedTechnicians: capability.technicians,
    publishedEquipmentTags: capability.equipmentTags,
    publishedBrandAuthItems: publishedItems,
    lastProfileVerifiedAt: capability.lastProfileVerifiedAt,
  }
}

module.exports = {
  EQUIPMENT_TAG_PRESETS,
  BRAND_AUTH_ITEM_MAX,
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
  normalizeBrandAuthItems,
  readBrandAuthItemsFromPhotos,
  filterPublicBrandAuthItems,
  brandAuthItemsSignature,
  earliestBrandAuthValidUntil,
  normalizeStringArray,
}
