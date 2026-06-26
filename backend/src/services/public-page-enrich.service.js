const { prisma } = require('../lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { STORE_EXTRAS } = require('../constants/content-seed')
const {
  formatQualificationForClient,
  QUALIFICATION_LABELS,
} = require('../lib/onboarding-payload')
const { resolvePublicCaseMediaUrl } = require('../lib/media-url')
const {
  STORE_SECTION_ORDER,
  CASE_SECTION_ORDER,
  SERVICE_SECTION_ORDER,
} = require('../schemas/public-page-sections.schema')

const STAFF_ROLE_LABELS = {
  owner: '管理员',
  manager: '店长',
  technician: '维修技师',
  advisor: '服务顾问',
  staff: '员工',
}

const DEFAULT_STORE_FAQ = [
  {
    q: '如何预约该门店？',
    a: '可通过页面预约入口或电话联系门店，确认到店时间与检测项目。',
  },
  {
    q: '公开案例的价格是否准确？',
    a: '案例价格为当时维修方案参考；实际费用以到店检测与门店报价为准。',
  },
  {
    q: '展示的图片是否包含隐私信息？',
    a: '公开展示仅使用脱敏图片，不含车牌、手机号等隐私信息。',
  },
]

function readPhotosMeta(photosJson) {
  const raw = photosJson && typeof photosJson === 'object' && !Array.isArray(photosJson) ? photosJson : {}
  return {
    publicFaq: Array.isArray(raw.publicFaq) ? raw.publicFaq : [],
    staffPublic: Array.isArray(raw.staffPublic) ? raw.staffPublic : [],
    vehicleSpecialties: Array.isArray(raw.vehicleSpecialties) ? raw.vehicleSpecialties : [],
  }
}

function sanitizeFaq(items) {
  return (items || [])
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const q = String(item.q || item.question || '').trim()
      const a = String(item.a || item.answer || '').trim()
      if (!q || !a) return null
      return { q, a }
    })
    .filter(Boolean)
}

function buildCertifications(merchant, extras = {}) {
  const rows = []
  const pushRow = (label, text, status = 'verified') => {
    if (!label) return
    rows.push({ label, text: text || '已认证', status })
  }

  if (merchant?.status === 'ACTIVE' || extras.auditStatus === 'approved') {
    pushRow('平台审核', '已通过平台审核')
  }
  if (merchant?.licensePhotoUrl) {
    pushRow('营业执照', merchant.legalName ? `${merchant.legalName} · 已认证` : '已认证')
  }
  const qualification = formatQualificationForClient(merchant?.qualificationJson)
  if (qualification?.photoUrl || qualification?.type) {
    const label = qualification.typeLabel || QUALIFICATION_LABELS[qualification.type] || '维修资质'
    const text = qualification.certNo ? `${qualification.certNo} · 已认证` : '已认证'
    pushRow(label, text)
  }
  if (extras.certifications?.length) {
    extras.certifications.forEach((item) => {
      pushRow(item.label, item.text, item.status || 'verified')
    })
  }
  return dedupeCertRows(rows)
}

function dedupeCertRows(rows) {
  const seen = new Set()
  return rows.filter((row) => {
    const key = `${row.label}:${row.text}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildCertWall(merchant, extras = {}) {
  const wall = []
  if (merchant?.licensePhotoUrl) {
    wall.push({
      type: 'license',
      label: '营业执照',
      imageUrl: resolvePublicCaseMediaUrl(merchant.licensePhotoUrl) || merchant.licensePhotoUrl,
      status: 'verified',
      text: merchant.legalName ? `${merchant.legalName} · 已认证` : '已认证',
    })
  }
  const qualification = formatQualificationForClient(merchant?.qualificationJson)
  if (qualification?.photoUrl) {
    wall.push({
      type: 'qualification',
      label: qualification.typeLabel || '维修资质',
      imageUrl: resolvePublicCaseMediaUrl(qualification.photoUrl) || qualification.photoUrl,
      status: 'verified',
      text: qualification.certNo ? `${qualification.certNo} · 已认证` : '已认证',
    })
  }
  const brandAuth = extras.brandAuthUrl
  if (brandAuth) {
    wall.push({
      type: 'brand_auth',
      label: '品牌授权',
      imageUrl: resolvePublicCaseMediaUrl(brandAuth) || brandAuth,
      status: 'verified',
      text: '已认证',
    })
  }
  return wall
}

async function loadStaffPublic(merchantId, storeId, photosMeta = {}, extras = {}) {
  const overlayMap = new Map(
    (photosMeta.staffPublic || []).map((item) => [String(item.id || item.name || ''), item])
  )
  const rows = await prisma.merchantStaff.findMany({
    where: {
      merchantId,
      status: 'ACTIVE',
      OR: [{ storeId: '' }, { storeId: storeId || '' }],
    },
    include: {
      user: { select: { nickname: true } },
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    take: 12,
  })

  const fromDb = rows.map((row) => {
    const overlay = overlayMap.get(row.id) || overlayMap.get(row.user?.nickname || '')
    const name =
      overlay?.name ||
      row.user?.nickname ||
      (row.role === 'owner' ? '门店管理员' : '门店员工')
    const roleLabel = overlay?.roleLabel || STAFF_ROLE_LABELS[row.role] || STAFF_ROLE_LABELS.staff
    const credentials = Array.isArray(overlay?.credentials)
      ? overlay.credentials.filter(Boolean)
      : []
    return {
      id: row.id,
      name,
      role: roleLabel,
      credentials,
    }
  })

  if (fromDb.length) return fromDb

  return (extras.staffPublic || []).map((item, index) => ({
    id: item.id || `seed_staff_${index}`,
    name: item.name || '技师',
    role: item.role || item.roleLabel || '维修技师',
    credentials: Array.isArray(item.credentials) ? item.credentials : [],
  }))
}

async function loadTransparency(store, merchantId, serviceCount = 0) {
  const extras = STORE_EXTRAS[store.id] || {}
  const lastRow = await prisma.merchantDailyStats.findFirst({
    where: { merchantId, storeId: store.id },
    orderBy: { statDate: 'desc' },
  })

  const caseCount =
    store.caseCount != null
      ? store.caseCount
      : await prisma.publicCase.count({
          where: { storeId: store.id, status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED },
        })

  const score = lastRow?.transparencyScore || extras.score || 0
  const albumRate =
    lastRow?.albumCompleteRate != null ? Math.round(Number(lastRow.albumCompleteRate) * 100) : null

  const parts = []
  if (caseCount > 0) parts.push(`已公开 ${caseCount} 个维修案例`)
  if (albumRate != null && albumRate > 0) parts.push(`近 30 天相册完整率 ${albumRate}%`)
  if (score >= 10) parts.push(`透明度评分 ${Math.round(Number(score))} 分`)
  if (serviceCount > 0) parts.push(`已上架 ${serviceCount} 个可预约服务`)

  const summary =
    parts.length > 0 ? `该门店${parts.join('，')}。` : '该门店正在完善辙见公开资料。'

  return {
    score: score >= 10 ? Math.round(Number(score)) : 0,
    caseCount,
    albumCompleteRate: albumRate,
    serviceCount,
    summary,
    asOfDate: lastRow?.statDate ? String(lastRow.statDate).slice(0, 10) : '',
  }
}

function resolveStoreFaq(photosMeta, extras) {
  const fromPhotos = sanitizeFaq(photosMeta.publicFaq)
  if (fromPhotos.length) return fromPhotos
  const fromExtras = sanitizeFaq(extras.faq)
  if (fromExtras.length) return fromExtras
  return DEFAULT_STORE_FAQ
}

function attachSectionMeta(payload, sectionOrder) {
  return {
    ...payload,
    sectionOrder,
  }
}

async function enrichStorePublicPage(mapped, storeRow, merchantRow, options = {}) {
  const extras = STORE_EXTRAS[storeRow.id] || {}
  const photosMeta = readPhotosMeta(storeRow.photosJson)
  const photosRaw =
    storeRow.photosJson && typeof storeRow.photosJson === 'object' ? storeRow.photosJson : {}

  const certifications = buildCertifications(merchantRow, extras)
  const certWall = buildCertWall(merchantRow, {
    ...extras,
    brandAuthUrl: photosRaw.brandAuthUrl || photosRaw.receptionUrl || '',
  })
  const staffPublic = await loadStaffPublic(
    storeRow.merchantId,
    storeRow.id,
    photosMeta,
    extras
  )
  const transparency = await loadTransparency(storeRow, storeRow.merchantId, options.serviceCount || 0)
  const faq = resolveStoreFaq(photosMeta, extras)
  const vehicleSpecialties =
    photosMeta.vehicleSpecialties.length > 0
      ? photosMeta.vehicleSpecialties
      : extras.vehicleSpecialties || []

  return attachSectionMeta(
    {
      ...mapped,
      contactName: merchantRow?.contactName || mapped.contactName || '',
      certifications,
      certWall,
      staffPublic,
      transparency,
      faq,
      vehicleSpecialties,
      aiSummary: mapped.aiSummary || mapped.intro || '',
    },
    STORE_SECTION_ORDER
  )
}

function enrichCasePublicPage(payload) {
  return attachSectionMeta(
    {
      ...payload,
      aiSummary: payload.aiSummary || payload.summary || '',
    },
    CASE_SECTION_ORDER
  )
}

function enrichServicePublicPage(payload) {
  const appointment =
    payload.appointmentJson && typeof payload.appointmentJson === 'object'
      ? payload.appointmentJson
      : {}
  const faq = sanitizeFaq(appointment.faq || payload.faq)
  return attachSectionMeta(
    {
      ...payload,
      aiSummary: payload.aiSummary || payload.summary || '',
      faq,
    },
    SERVICE_SECTION_ORDER
  )
}

module.exports = {
  enrichStorePublicPage,
  enrichCasePublicPage,
  enrichServicePublicPage,
  buildCertifications,
  buildCertWall,
  loadStaffPublic,
  loadTransparency,
  sanitizeFaq,
  DEFAULT_STORE_FAQ,
}
