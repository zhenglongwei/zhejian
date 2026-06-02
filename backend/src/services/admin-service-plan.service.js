const { prisma } = require('../lib/prisma')
const { newId, toIso } = require('../lib/ids')
const {
  PLAN_SALE_STATUS,
  saleStatusLabel,
} = require('../constants/service-plan')
const { getServiceItem } = require('../constants/service-catalog')
const { formatPlanRecord } = require('./service-plan-format')
const { buildReviewComment } = require('./merchant-service-plan.service')

/** 运营抽查 / 处罚列表（无前置审核队列） */
function buildListWhere(query = {}) {
  const tab = String(query.tab || 'online').toLowerCase()
  const where = {}

  if (tab === 'online') {
    where.saleStatus = PLAN_SALE_STATUS.ONLINE
  } else if (tab === 'offline') {
    where.saleStatus = PLAN_SALE_STATUS.OFFLINE
  } else if (tab === 'suspended') {
    where.saleStatus = PLAN_SALE_STATUS.SUSPENDED
  }

  const keyword = String(query.keyword || '').trim()
  if (keyword) {
    where.OR = [{ name: { contains: keyword } }, { summary: { contains: keyword } }]
  }

  return { tab, where }
}

async function fetchServiceReviewLogs(planId) {
  if (!prisma.serviceReviewLog) return []
  return prisma.serviceReviewLog.findMany({
    where: { planId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

async function appendServiceReviewLog({
  planId,
  merchantId,
  storeId,
  reviewerId,
  reviewAction,
  reviewComment,
  beforeStatus,
  afterStatus,
}) {
  if (!prisma.serviceReviewLog) {
    console.warn('[admin-service] 跳过监管留痕：service_review_log 表未就绪')
    return
  }
  await prisma.serviceReviewLog.create({
    data: {
      id: newId('srl'),
      planId,
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

function resolveServiceItemName(row, item) {
  if (row.serviceItemId === 'item_custom') return '自定义'
  return item?.name || row.serviceItemId
}

function formatListItem(row, store, merchant) {
  const item = getServiceItem(row.serviceItemId)
  return {
    planId: row.id,
    name: row.name,
    storeId: row.storeId,
    storeName: store?.name || '',
    merchantId: row.merchantId,
    merchantName: merchant?.name || '',
    serviceItemName: resolveServiceItemName(row, item),
    priceMode: row.priceMode,
    complexityLevel: item?.complexityLevel || '',
    saleStatus: row.saleStatus,
    saleStatusLabel: saleStatusLabel(row.saleStatus),
    publishedAt: toIso(row.publishedAt),
    updatedAt: toIso(row.updatedAt),
  }
}

async function listAdminServicePlans(query = {}) {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20))
  const { tab, where } = buildListWhere(query)

  const [rows, total] = await Promise.all([
    prisma.merchantServicePlan.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.merchantServicePlan.count({ where }),
  ])

  const storeIds = [...new Set(rows.map((r) => r.storeId))]
  const merchantIds = [...new Set(rows.map((r) => r.merchantId))]
  const [stores, merchants] = await Promise.all([
    prisma.store.findMany({ where: { id: { in: storeIds } } }),
    prisma.merchant.findMany({ where: { id: { in: merchantIds } } }),
  ])
  const storeMap = new Map(stores.map((s) => [s.id, s]))
  const merchantMap = new Map(merchants.map((m) => [m.id, m]))

  return {
    list: rows.map((row) =>
      formatListItem(row, storeMap.get(row.storeId), merchantMap.get(row.merchantId))
    ),
    page,
    pageSize,
    total,
    tab,
  }
}

async function loadPlanForReview(planId) {
  const plan = await prisma.merchantServicePlan.findUnique({ where: { id: planId } })
  if (!plan) {
    const err = new Error('服务方案不存在')
    err.status = 404
    throw err
  }
  const [store, merchant] = await Promise.all([
    prisma.store.findUnique({ where: { id: plan.storeId } }),
    prisma.merchant.findUnique({ where: { id: plan.merchantId } }),
  ])
  if (!store) {
    const err = new Error('关联门店不存在')
    err.status = 404
    throw err
  }
  return { plan, store, merchant }
}

async function getAdminServicePlanDetail(planId) {
  const { plan, store, merchant } = await loadPlanForReview(planId)
  const item = getServiceItem(plan.serviceItemId)
  const reviewLogs = await fetchServiceReviewLogs(planId)
  const formatted = formatPlanRecord(plan, store)

  return {
    ...formatted,
    merchantName: merchant?.name || '',
    serviceItemName: resolveServiceItemName(plan, item),
    complexityLevel: item?.complexityLevel || '',
    saleStatusLabel: saleStatusLabel(plan.saleStatus),
    reviewLogs: reviewLogs.map((log) => ({
      id: log.id,
      reviewAction: log.reviewAction,
      reviewComment: log.reviewComment,
      beforeStatus: log.beforeStatus,
      afterStatus: log.afterStatus,
      reviewerId: log.reviewerId,
      createdAt: toIso(log.createdAt),
    })),
  }
}

async function recordSpotCheckServicePlan(
  planId,
  { reviewerId, comment = '', result = 'pass' } = {}
) {
  const { plan } = await loadPlanForReview(planId)
  const reviewComment = buildReviewComment(result === 'fail' ? '抽查不通过' : '抽查通过', comment)

  await appendServiceReviewLog({
    planId,
    merchantId: plan.merchantId,
    storeId: plan.storeId,
    reviewerId,
    reviewAction: 'spot_check',
    reviewComment,
    beforeStatus: plan.saleStatus,
    afterStatus: plan.saleStatus,
  })

  return getAdminServicePlanDetail(planId)
}

async function suspendAdminServicePlan(
  planId,
  { reviewerId, comment = '', reasonType = '' } = {}
) {
  const { plan } = await loadPlanForReview(planId)
  const reviewComment = buildReviewComment(reasonType || '平台强制下架', comment)

  await prisma.merchantServicePlan.update({
    where: { id: planId },
    data: {
      saleStatus: PLAN_SALE_STATUS.SUSPENDED,
      rejectReason: reviewComment,
    },
  })

  await appendServiceReviewLog({
    planId,
    merchantId: plan.merchantId,
    storeId: plan.storeId,
    reviewerId,
    reviewAction: 'suspend',
    reviewComment,
    beforeStatus: plan.saleStatus,
    afterStatus: PLAN_SALE_STATUS.SUSPENDED,
  })

  return getAdminServicePlanDetail(planId)
}

async function forceUnpublishAdminServicePlan(
  planId,
  { reviewerId, comment = '', reasonType = '' } = {}
) {
  const { plan } = await loadPlanForReview(planId)
  const reviewComment = buildReviewComment(reasonType || '要求商家下架', comment)

  await prisma.merchantServicePlan.update({
    where: { id: planId },
    data: {
      saleStatus: PLAN_SALE_STATUS.OFFLINE,
      rejectReason: reviewComment,
    },
  })

  await appendServiceReviewLog({
    planId,
    merchantId: plan.merchantId,
    storeId: plan.storeId,
    reviewerId,
    reviewAction: 'force_unpublish',
    reviewComment,
    beforeStatus: plan.saleStatus,
    afterStatus: PLAN_SALE_STATUS.OFFLINE,
  })

  return getAdminServicePlanDetail(planId)
}

async function limitAppointmentAdminServicePlan(
  planId,
  { reviewerId, comment = '', reasonType = '' } = {}
) {
  const { plan } = await loadPlanForReview(planId)
  const reviewComment = buildReviewComment(reasonType || '限制预约', comment)

  await prisma.merchantServicePlan.update({
    where: { id: planId },
    data: { acceptAppointment: false },
  })

  await appendServiceReviewLog({
    planId,
    merchantId: plan.merchantId,
    storeId: plan.storeId,
    reviewerId,
    reviewAction: 'limit_appointment',
    reviewComment,
    beforeStatus: 'acceptAppointment=true',
    afterStatus: 'acceptAppointment=false',
  })

  return getAdminServicePlanDetail(planId)
}

async function restoreAdminServicePlan(planId, { reviewerId, comment = '' } = {}) {
  const { plan } = await loadPlanForReview(planId)
  if (plan.saleStatus !== PLAN_SALE_STATUS.SUSPENDED) {
    const err = new Error('仅可对平台强制下架的方案解除处罚')
    err.status = 409
    throw err
  }

  await prisma.merchantServicePlan.update({
    where: { id: planId },
    data: {
      saleStatus: PLAN_SALE_STATUS.OFFLINE,
      rejectReason: '',
    },
  })

  await appendServiceReviewLog({
    planId,
    merchantId: plan.merchantId,
    storeId: plan.storeId,
    reviewerId,
    reviewAction: 'restore',
    reviewComment: comment || '解除平台处罚，商家可自行重新上架',
    beforeStatus: PLAN_SALE_STATUS.SUSPENDED,
    afterStatus: PLAN_SALE_STATUS.OFFLINE,
  })

  return getAdminServicePlanDetail(planId)
}

module.exports = {
  listAdminServicePlans,
  getAdminServicePlanDetail,
  recordSpotCheckServicePlan,
  suspendAdminServicePlan,
  forceUnpublishAdminServicePlan,
  limitAppointmentAdminServicePlan,
  restoreAdminServicePlan,
}
