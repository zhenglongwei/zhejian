const { prisma } = require('../lib/prisma')
const { newId, maskPhone, toIso } = require('../lib/ids')
const {
  MERCHANT_STATUS,
  STORE_STATUS,
  merchantStatusLabel,
} = require('../constants/merchant')
const { activateMerchant } = require('./merchant-onboarding.service')
const {
  formatQualificationForClient,
  formatPhotosForClient,
} = require('../lib/onboarding-payload')

function buildListWhere(query = {}) {
  const tab = String(query.tab || 'pending').toLowerCase()
  const where = {}

  if (tab === 'pending') {
    where.status = MERCHANT_STATUS.PENDING_AUDIT
  } else if (tab === 'approved') {
    where.status = MERCHANT_STATUS.ACTIVE
  } else if (tab === 'rejected') {
    where.status = MERCHANT_STATUS.AUDIT_REJECTED
  } else if (tab === 'need_modify') {
    where.status = MERCHANT_STATUS.NEED_MODIFY
  } else {
    where.status = MERCHANT_STATUS.PENDING_AUDIT
  }

  const keyword = String(query.keyword || '').trim()
  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { contactName: { contains: keyword } },
      { contactPhone: { contains: keyword } },
      { stores: { some: { address: { contains: keyword } } } },
    ]
  }

  return { tab, where }
}

function pickPrimaryStore(merchant) {
  const stores = merchant?.stores || []
  if (!stores.length) return null
  return stores[0]
}

function formatListItem(merchant, store) {
  const phone = merchant.contactPhone || store?.phone || ''
  const services = Array.isArray(store?.servicesJson) ? store.servicesJson : []
  return {
    merchantId: merchant.id,
    storeId: store?.id || '',
    storeName: store?.name || merchant.name,
    contactName: merchant.contactName,
    phoneMasked: maskPhone(phone),
    address: store?.address || '',
    serviceCount: services.length,
    status: merchant.status,
    statusLabel: merchantStatusLabel(merchant.status),
    submittedAt: toIso(merchant.submittedAt),
    updatedAt: toIso(merchant.updatedAt),
  }
}

async function listAdminMerchants(query = {}) {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20))
  const { tab, where } = buildListWhere(query)

  const [rows, total] = await Promise.all([
    prisma.merchant.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        stores: { take: 1, orderBy: { createdAt: 'asc' } },
      },
    }),
    prisma.merchant.count({ where }),
  ])

  return {
    list: rows.map((row) => formatListItem(row, pickPrimaryStore(row))),
    page,
    pageSize,
    total,
    tab,
  }
}

async function fetchMerchantReviewLogs(merchantId) {
  if (!prisma.merchantReviewLog) {
    console.warn(
      '[admin-merchant] prisma.merchantReviewLog 不可用，请执行 npm run db:generate && npm run db:migrate'
    )
    return []
  }
  return prisma.merchantReviewLog.findMany({
    where: { merchantId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

async function appendMerchantReviewLog({
  merchantId,
  storeId = '',
  reviewerId,
  reviewAction,
  reviewComment,
  beforeStatus,
  afterStatus,
}) {
  if (!prisma.merchantReviewLog) {
    console.warn('[admin-merchant] 跳过审核留痕：merchant_review_log 表未就绪')
    return
  }
  await prisma.merchantReviewLog.create({
    data: {
      id: newId('mrl'),
      merchantId,
      storeId,
      reviewerId: reviewerId || 'admin_system',
      reviewAction,
      reviewComment: reviewComment || '',
      beforeStatus: beforeStatus || '',
      afterStatus: afterStatus || '',
    },
  })
}

async function loadMerchantForReview(merchantId) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    include: {
      stores: { take: 1, orderBy: { createdAt: 'asc' } },
    },
  })
  if (!merchant) {
    const err = new Error('商家不存在')
    err.status = 404
    throw err
  }
  const store = pickPrimaryStore(merchant)
  if (!store) {
    const err = new Error('关联门店不存在')
    err.status = 404
    throw err
  }
  return { merchant, store }
}

async function getAdminMerchantDetail(merchantId) {
  const { merchant, store } = await loadMerchantForReview(merchantId)
  const phone = merchant.contactPhone || store.phone || ''
  const services = Array.isArray(store.servicesJson) ? store.servicesJson : []
  const reviewLogs = await fetchMerchantReviewLogs(merchantId)
  const qualification = formatQualificationForClient(merchant.qualificationJson)
  const photos = formatPhotosForClient(store.photosJson)

  return {
    merchantId: merchant.id,
    storeId: store.id,
    storeName: store.name || merchant.name,
    contactName: merchant.contactName,
    phoneMasked: maskPhone(phone),
    storePhone: store.phone || '',
    address: store.address,
    latitude: store.latitude,
    longitude: store.longitude,
    businessHours: store.businessHours || '',
    intro: store.intro || '',
    services,
    legalName: merchant.legalName || '',
    creditCode: merchant.creditCode || '',
    licensePhotoUrl: merchant.licensePhotoUrl || '',
    contactEmail: merchant.contactEmail || '',
    qualification,
    photos,
    status: merchant.status,
    statusLabel: merchantStatusLabel(merchant.status),
    rejectReason: merchant.rejectReason || '',
    agreedAt: toIso(merchant.agreedAt),
    submittedAt: toIso(merchant.submittedAt),
    approvedAt: toIso(merchant.approvedAt),
    ownerUserId: merchant.ownerUserId,
    reviewLogs: reviewLogs.map((log) => ({
      id: log.id,
      reviewAction: log.reviewAction,
      reviewComment: log.reviewComment,
      beforeStatus: log.beforeStatus,
      afterStatus: log.afterStatus,
      reviewerId: log.reviewerId,
      createdAt: toIso(log.createdAt),
    })),
    updatedAt: toIso(merchant.updatedAt),
  }
}

function buildReviewComment(reasonType, comment) {
  return [reasonType, comment].filter(Boolean).join('：')
}

async function approveAdminMerchant(merchantId, { reviewerId, comment = '' } = {}) {
  const { merchant, store } = await loadMerchantForReview(merchantId)
  if (merchant.status !== MERCHANT_STATUS.PENDING_AUDIT) {
    const err = new Error('当前状态不可通过')
    err.status = 409
    throw err
  }

  await activateMerchant(merchant.id, merchant.ownerUserId, store.id)

  await appendMerchantReviewLog({
    merchantId,
    storeId: store.id,
    reviewerId,
    reviewAction: 'approve',
    reviewComment: comment,
    beforeStatus: merchant.status,
    afterStatus: MERCHANT_STATUS.ACTIVE,
  })

  const { notifyMerchantAuditResult } = require('./notification.service')
  notifyMerchantAuditResult({ merchant, approved: true, comment }).catch((e) => {
    console.warn('[notification] merchant approve', e && e.message)
  })

  return getAdminMerchantDetail(merchantId)
}

async function rejectAdminMerchant(merchantId, { reviewerId, comment = '', reasonType = '' } = {}) {
  const { merchant, store } = await loadMerchantForReview(merchantId)
  if (merchant.status !== MERCHANT_STATUS.PENDING_AUDIT) {
    const err = new Error('当前状态不可驳回')
    err.status = 409
    throw err
  }

  const reviewComment = buildReviewComment(reasonType, comment)

  await prisma.$transaction([
    prisma.merchant.update({
      where: { id: merchantId },
      data: {
        status: MERCHANT_STATUS.AUDIT_REJECTED,
        rejectReason: reviewComment,
      },
    }),
    prisma.store.update({
      where: { id: store.id },
      data: { status: STORE_STATUS.DRAFT },
    }),
  ])

  await appendMerchantReviewLog({
    merchantId,
    storeId: store.id,
    reviewerId,
    reviewAction: 'reject',
    reviewComment,
    beforeStatus: merchant.status,
    afterStatus: MERCHANT_STATUS.AUDIT_REJECTED,
  })

  const { notifyMerchantAuditResult } = require('./notification.service')
  notifyMerchantAuditResult({ merchant, approved: false, comment: reviewComment }).catch((e) => {
    console.warn('[notification] merchant reject', e && e.message)
  })

  return getAdminMerchantDetail(merchantId)
}

async function requestModifyAdminMerchant(
  merchantId,
  { reviewerId, comment = '', reasonType = '' } = {}
) {
  const { merchant, store } = await loadMerchantForReview(merchantId)
  if (merchant.status !== MERCHANT_STATUS.PENDING_AUDIT) {
    const err = new Error('当前状态不可要求修改')
    err.status = 409
    throw err
  }

  const reviewComment = buildReviewComment(reasonType, comment)

  await prisma.$transaction([
    prisma.merchant.update({
      where: { id: merchantId },
      data: {
        status: MERCHANT_STATUS.NEED_MODIFY,
        rejectReason: reviewComment,
      },
    }),
    prisma.store.update({
      where: { id: store.id },
      data: { status: STORE_STATUS.DRAFT },
    }),
  ])

  await appendMerchantReviewLog({
    merchantId,
    storeId: store.id,
    reviewerId,
    reviewAction: 'request_modify',
    reviewComment,
    beforeStatus: merchant.status,
    afterStatus: MERCHANT_STATUS.NEED_MODIFY,
  })

  const { notifyMerchantAuditResult } = require('./notification.service')
  notifyMerchantAuditResult({
    merchant,
    approved: false,
    needModify: true,
    comment: reviewComment,
  }).catch((e) => {
    console.warn('[notification] merchant need modify', e && e.message)
  })

  return getAdminMerchantDetail(merchantId)
}

module.exports = {
  listAdminMerchants,
  getAdminMerchantDetail,
  approveAdminMerchant,
  rejectAdminMerchant,
  requestModifyAdminMerchant,
}
