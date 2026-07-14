const { prisma } = require('../lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { computeTransparency } = require('./merchant-daily-stats.service')
const { merchantHasPublicIndex } = require('./merchant-subscription.service')
const { STORE_EXTRAS } = require('../constants/content-seed')
const {
  formatQualificationForClient,
  QUALIFICATION_LABELS,
} = require('../lib/onboarding-payload')
const { resolvePublicCaseMediaUrl } = require('../lib/media-url')
const { resolveClientReadableMediaUrl } = require('../lib/media-storage')
const {
  STORE_SECTION_ORDER,
  CASE_SECTION_ORDER,
  SERVICE_SECTION_ORDER,
} = require('../schemas/public-page-sections.schema')
const {
  buildTransparencyDimensions,
  normalizeTransparencyPayload,
  EMPTY_CASE_SUMMARY,
  PUBLIC_METHODOLOGY,
} = require('../schemas/store-transparency.schema')
const { buildStorePageSchemaGraph } = require('../lib/schema-graph')
const {
  filterPublicSpecialties,
  filterPublicEnvironmentImages,
} = require('../utils/store-public-display')
const { mapStoreCasePreview } = require('../utils/store-case-preview')
const { buildStorePublicFaq, sanitizeFaq } = require('../utils/store-public-faq')
const { config } = require('../config')

const STAFF_ROLE_LABELS = {
  owner: '管理员',
  manager: '店长',
  technician: '维修技师',
  advisor: '服务顾问',
  staff: '员工',
}

function readPhotosMeta(photosJson) {
  const raw = photosJson && typeof photosJson === 'object' && !Array.isArray(photosJson) ? photosJson : {}
  return {
    publicFaq: Array.isArray(raw.publicFaq) ? raw.publicFaq : [],
    staffPublic: Array.isArray(raw.staffPublic) ? raw.staffPublic : [],
    vehicleSpecialties: Array.isArray(raw.vehicleSpecialties) ? raw.vehicleSpecialties : [],
  }
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

function resolvePublicCredentialImageUrl(url) {
  return resolveClientReadableMediaUrl(url) || resolvePublicCaseMediaUrl(url) || ''
}

function buildCertWall(merchant, extras = {}) {
  const wall = []
  if (merchant?.licensePhotoUrl) {
    wall.push({
      type: 'license',
      label: '营业执照',
      imageUrl: resolvePublicCredentialImageUrl(merchant.licensePhotoUrl),
      status: 'verified',
      text: merchant.legalName ? `${merchant.legalName} · 已认证` : '已认证',
    })
  }
  const qualification = formatQualificationForClient(merchant?.qualificationJson)
  if (qualification?.photoUrl) {
    wall.push({
      type: 'qualification',
      label: qualification.typeLabel || '维修资质',
      imageUrl: resolvePublicCredentialImageUrl(qualification.photoUrl),
      status: 'verified',
      text: qualification.certNo ? `${qualification.certNo} · 已认证` : '已认证',
    })
  }
  const brandAuth = extras.brandAuthUrl
  if (brandAuth) {
    wall.push({
      type: 'brand_auth',
      label: '品牌授权',
      imageUrl: resolvePublicCredentialImageUrl(brandAuth),
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

async function loadTransparency(store, merchantId, options = {}) {
  const serviceCount = Number(options.serviceCount) || 0
  const certifications = options.certifications || []
  const certWall = options.certWall || []
  const casePreviews = options.casePreviews || []
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

  let breakdown = null
  if (lastRow && merchantId) {
    const statDate =
      lastRow.statDate instanceof Date
        ? lastRow.statDate.toISOString().slice(0, 10)
        : String(lastRow.statDate).slice(0, 10)
    try {
      const computed = await computeTransparency(
        merchantId,
        store.id,
        statDate,
        lastRow.albumCompleteRate
      )
      breakdown = computed.breakdown
    } catch (e) {
      breakdown = null
    }
  }

  if (caseCount <= 0) {
    return normalizeTransparencyPayload({
      caseCount: 0,
      serviceCount,
      summary: EMPTY_CASE_SUMMARY,
    })
  }

  const parts = []
  if (caseCount > 0) parts.push(`已公开 ${caseCount} 个维修案例`)
  if (serviceCount > 0) parts.push(`已上架 ${serviceCount} 个可预约服务`)
  if (albumRate != null && albumRate > 0) {
    parts.push(`近期服务过程资料齐全度约 ${albumRate}%`)
  }

  const summary =
    parts.length > 0
      ? `该门店${parts.join('，')}。可点开案例与资质区核查依据。`
      : '该门店正在完善辙见公开资料。'

  const dimensions = buildTransparencyDimensions({
    storeId: store.id,
    caseCount,
    albumCompleteRate: albumRate,
    serviceCount,
    breakdown,
    certifications,
    certWall,
    casePreviews,
  })

  return normalizeTransparencyPayload({
    score: score >= 10 ? Math.round(Number(score)) : null,
    caseCount,
    albumCompleteRate: albumRate,
    serviceCount,
    summary,
    methodology: PUBLIC_METHODOLOGY,
    asOfDate: lastRow?.statDate ? String(lastRow.statDate).slice(0, 10) : '',
    dimensions,
  })
}

function resolveStoreFaq(ctx) {
  return buildStorePublicFaq(ctx)
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

  const casePreviewRows = await prisma.publicCase.findMany({
    where: { storeId: storeRow.id, status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED },
    orderBy: { publishedAt: 'desc' },
    take: 3,
    select: { id: true, title: true, serviceName: true, contentJson: true },
  })
  const casePreviews = casePreviewRows.map((row) => mapStoreCasePreview(row))

  const vehicleSpecialties = filterPublicSpecialties(
    photosMeta.vehicleSpecialties.length > 0
      ? photosMeta.vehicleSpecialties
      : extras.vehicleSpecialties || []
  )
  const specialties = filterPublicSpecialties(mapped.specialties || [])
  const environmentImages = filterPublicEnvironmentImages(mapped.environmentImages || [])

  const transparency = await loadTransparency(storeRow, storeRow.merchantId, {
    serviceCount: options.serviceCount || 0,
    certifications,
    certWall,
    casePreviews,
  })

  const customFaq = [...sanitizeFaq(photosMeta.publicFaq), ...sanitizeFaq(extras.faq)]
  const { faq, faqSource } = resolveStoreFaq({
    storeName: mapped.name || storeRow.name,
    customFaq,
    specialties,
    vehicleSpecialties,
    casePreviews,
    caseCount: mapped.caseCount != null ? mapped.caseCount : casePreviews.length,
    serviceNames: Array.isArray(options.serviceNames) ? options.serviceNames : [],
    address: mapped.address || storeRow.address || '',
    businessHours: mapped.businessHours || storeRow.businessHours || '',
    phone: mapped.phone || storeRow.phone || '',
  })

  const publicIndex = await merchantHasPublicIndex(storeRow.merchantId)

  const payload = {
    ...mapped,
    specialties,
    environmentImages,
    casePreviews,
    seo: {
      noindex: !publicIndex,
      allowIndex: publicIndex,
      robots: publicIndex ? 'index,follow' : 'noindex,follow',
      canonicalPath: `/store/${storeRow.id}.html`,
    },
    contactName: merchantRow?.contactName || mapped.contactName || '',
    certifications,
    certWall,
    staffPublic,
    transparency,
    faq,
    faqSource,
    vehicleSpecialties,
    aiSummary: mapped.aiSummary || mapped.intro || '',
    auditMeta: {
      auditor: '辙见平台运营',
      basis: '营业执照、维修资质证照、门店实景照片',
      approvedAt:
        merchantRow?.approvedAt instanceof Date
          ? merchantRow.approvedAt.toISOString().slice(0, 10)
          : merchantRow?.approvedAt
            ? String(merchantRow.approvedAt).slice(0, 10)
            : '',
    },
  }

  payload.schemaGraph = buildStorePageSchemaGraph({
    baseUrl: config.publicBaseUrl,
    store: payload,
    transparency,
    faq,
    casePreviews,
    organizationSameAs: config.geo?.organizationSameAs || [],
  })

  return attachSectionMeta(payload, STORE_SECTION_ORDER)
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
  buildStorePublicFaq,
}
