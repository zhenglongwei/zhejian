const { prisma } = require('../lib/prisma')
const { newId, maskPhone, toIso } = require('../lib/ids')
const { REPORT_STATUS } = require('../constants/report')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { extractSnapshotFromContentJson } = require('../schemas/case-snapshot.schema')
const { appendReviewLog } = require('./admin-case.service')
const { forceUnpublishAdminServicePlan } = require('./admin-service-plan.service')

const REPORT_TABS = {
  pending: REPORT_STATUS.PENDING,
  processing: REPORT_STATUS.PROCESSING,
  resolved: REPORT_STATUS.RESOLVED,
  rejected: REPORT_STATUS.REJECTED,
}

const REPORT_TYPE_LABEL = {
  false_price: '虚假或误导性价格',
  false_promise: '夸大宣传/虚假承诺',
  false_qualification: '资质、授权造假',
  fake_case: '伪造、盗用案例',
  misleading_media: '误导性图片或文案',
  other: '其他虚假信息',
}

const TARGET_TYPE_LABEL = {
  service: '服务',
  store: '门店',
  case: '案例',
  geo: '专题',
}

const STATUS_LABEL = {
  pending: '待处理',
  processing: '处理中',
  resolved: '已成立',
  rejected: '已驳回',
}

function formatListItem(row, user) {
  return {
    id: row.id,
    targetType: row.targetType,
    targetTypeLabel: TARGET_TYPE_LABEL[row.targetType] || row.targetType,
    targetId: row.targetId,
    targetTitle: row.targetTitle,
    reportType: row.reportType,
    reportTypeLabel: REPORT_TYPE_LABEL[row.reportType] || row.reportType,
    status: row.status,
    statusLabel: STATUS_LABEL[row.status] || row.status,
    reporterNickname: user?.nickname || '用户',
    reporterPhoneMasked: maskPhone(user?.phone || row.contactPhone || ''),
    createdAt: toIso(row.createdAt),
  }
}

async function fetchReportHandleLogs(reportId) {
  if (!prisma.reportHandleLog) return []
  return prisma.reportHandleLog.findMany({
    where: { reportId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

async function appendReportHandleLog({
  reportId,
  reviewerId,
  handleAction,
  handleComment,
  beforeStatus,
  afterStatus,
}) {
  if (!prisma.reportHandleLog) {
    console.warn('[admin-report] 跳过留痕：report_handle_log 表未就绪')
    return
  }
  await prisma.reportHandleLog.create({
    data: {
      id: newId('rhl'),
      reportId,
      reviewerId: reviewerId || 'admin_system',
      handleAction,
      handleComment: handleComment || '',
      beforeStatus: beforeStatus || '',
      afterStatus: afterStatus || '',
    },
  })
}

async function loadReportOrThrow(reportId) {
  const row = await prisma.contentReport.findUnique({ where: { id: reportId } })
  if (!row) {
    const err = new Error('举报记录不存在')
    err.status = 404
    throw err
  }
  return row
}

async function listAdminReports(query = {}) {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20))
  const tab = String(query.tab || 'pending').toLowerCase()
  const where = {}

  if (REPORT_TABS[tab]) {
    where.status = REPORT_TABS[tab]
  }

  const keyword = String(query.keyword || '').trim()
  if (keyword) {
    where.OR = [
      { targetTitle: { contains: keyword } },
      { targetId: { contains: keyword } },
      { description: { contains: keyword } },
    ]
  }

  const [rows, total] = await Promise.all([
    prisma.contentReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contentReport.count({ where }),
  ])

  const userIds = [...new Set(rows.map((r) => r.userId))]
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } } })
    : []
  const userMap = new Map(users.map((u) => [u.id, u]))

  return {
    list: rows.map((row) => formatListItem(row, userMap.get(row.userId))),
    page,
    pageSize,
    total,
    tab,
  }
}

async function getAdminReportDetail(reportId) {
  const row = await loadReportOrThrow(reportId)
  const user = await prisma.user.findUnique({ where: { id: row.userId } })
  const handleLogs = await fetchReportHandleLogs(reportId)

  return {
    id: row.id,
    targetType: row.targetType,
    targetTypeLabel: TARGET_TYPE_LABEL[row.targetType] || row.targetType,
    targetId: row.targetId,
    targetTitle: row.targetTitle,
    reportType: row.reportType,
    reportTypeLabel: REPORT_TYPE_LABEL[row.reportType] || row.reportType,
    description: row.description,
    images: row.imagesJson || [],
    contactPhone: maskPhone(row.contactPhone || user?.phone || ''),
    status: row.status,
    statusLabel: STATUS_LABEL[row.status] || row.status,
    resolution: row.resolution || '',
    reporterNickname: user?.nickname || '用户',
    reporterPhoneMasked: maskPhone(user?.phone || row.contactPhone || ''),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    handleLogs: handleLogs.map((log) => ({
      id: log.id,
      handleAction: log.handleAction,
      handleComment: log.handleComment,
      beforeStatus: log.beforeStatus,
      afterStatus: log.afterStatus,
      reviewerId: log.reviewerId,
      createdAt: toIso(log.createdAt),
    })),
  }
}

async function updateReportStatus(reportId, expectedStatus, toStatus, patch = {}) {
  const row = await loadReportOrThrow(reportId)
  if (row.status !== expectedStatus) {
    const err = new Error('举报状态已变更，请刷新后重试')
    err.status = 409
    throw err
  }
  return prisma.contentReport.update({
    where: { id: reportId },
    data: {
      status: toStatus,
      ...patch,
    },
  })
}

async function acceptAdminReport(reportId, { reviewerId, comment = '' } = {}) {
  const row = await loadReportOrThrow(reportId)
  await updateReportStatus(reportId, REPORT_STATUS.PENDING, REPORT_STATUS.PROCESSING)
  await appendReportHandleLog({
    reportId,
    reviewerId,
    handleAction: 'accept',
    handleComment: comment || '已受理',
    beforeStatus: row.status,
    afterStatus: REPORT_STATUS.PROCESSING,
  })
  return getAdminReportDetail(reportId)
}

async function rejectAdminReport(reportId, { reviewerId, comment = '' } = {}) {
  const row = await loadReportOrThrow(reportId)
  if (!String(comment || '').trim()) {
    const err = new Error('驳回须填写原因')
    err.status = 400
    throw err
  }
  const active = [REPORT_STATUS.PENDING, REPORT_STATUS.PROCESSING]
  if (!active.includes(row.status)) {
    const err = new Error('当前状态不可驳回')
    err.status = 409
    throw err
  }
  await prisma.contentReport.update({
    where: { id: reportId },
    data: {
      status: REPORT_STATUS.REJECTED,
      resolution: comment.trim(),
    },
  })
  await appendReportHandleLog({
    reportId,
    reviewerId,
    handleAction: 'reject',
    handleComment: comment.trim(),
    beforeStatus: row.status,
    afterStatus: REPORT_STATUS.REJECTED,
  })
  return getAdminReportDetail(reportId)
}

async function offlinePublicCasePreservingSnapshot(
  caseId,
  { reviewerId, reportId = '', comment = '' } = {}
) {
  const caseRow = await prisma.publicCase.findUnique({ where: { id: caseId } })
  if (!caseRow) return false

  const beforeStatus = caseRow.status
  const snapshot = extractSnapshotFromContentJson(caseRow.contentJson)
  const snapshotVersion = snapshot?.version || 0

  await prisma.publicCase.update({
    where: { id: caseId },
    data: {
      status: PUBLIC_CASE_STATUS.OFFLINE,
      publishedAt: null,
    },
  })

  const auditComment = buildReportOfflineAuditComment({
    comment,
    reportId,
    snapshotVersion,
    frozenAt: snapshot?.frozenAt || '',
    hadSnapshot: Boolean(snapshot),
  })

  await appendReviewLog({
    caseId,
    reviewerId,
    reviewAction: 'report_offline',
    reviewComment: auditComment,
    beforeStatus,
    afterStatus: PUBLIC_CASE_STATUS.OFFLINE,
    riskLevel: 'report',
  })

  return true
}

function buildReportOfflineAuditComment({
  comment = '',
  reportId = '',
  snapshotVersion = 0,
  frozenAt = '',
  hadSnapshot = false,
} = {}) {
  const parts = [String(comment || '').trim() || '举报成立，下线公开案例']
  if (reportId) parts.push(`reportId=${reportId}`)
  if (hadSnapshot && snapshotVersion >= 1) {
    parts.push(`snapshotVersion=${snapshotVersion}`)
    if (frozenAt) parts.push(`frozenAt=${frozenAt}`)
    parts.push('snapshotPreserved=1')
  } else {
    parts.push('snapshotPreserved=0')
  }
  return parts.join(' · ')
}

async function hideReportTarget(row, reviewerId, comment, reportId = '') {
  const reason = comment || '举报成立，隐藏相关内容'
  if (row.targetType === 'service') {
    await forceUnpublishAdminServicePlan(row.targetId, {
      reviewerId,
      comment: reason,
      reasonType: '用户举报',
    })
    return '已要求下架服务方案'
  }
  if (row.targetType === 'case') {
    const hidden = await offlinePublicCasePreservingSnapshot(row.targetId, {
      reviewerId,
      reportId,
      comment: reason,
    })
    return hidden ? '已隐藏公开案例（快照已保留留痕）' : '案例不存在或已下线'
  }
  if (row.targetType === 'store') {
    const store = await prisma.store.findUnique({ where: { id: row.targetId } })
    if (store) {
      await prisma.store.update({
        where: { id: row.targetId },
        data: { status: 'DRAFT' },
      })
    }
    return '已隐藏门店主页'
  }
  return ''
}

async function resolveAdminReport(
  reportId,
  { reviewerId, comment = '', hideContent = false } = {}
) {
  const row = await loadReportOrThrow(reportId)
  if (row.status !== REPORT_STATUS.PROCESSING) {
    const err = new Error('请先受理后再处置')
    err.status = 409
    throw err
  }

  let resolution = String(comment || '').trim() || '举报成立'
  if (hideContent) {
    const hideNote = await hideReportTarget(row, reviewerId, resolution, reportId)
    if (hideNote) {
      resolution = `${resolution}；${hideNote}`
    }
  }

  await updateReportStatus(reportId, REPORT_STATUS.PROCESSING, REPORT_STATUS.RESOLVED, {
    resolution,
  })
  await appendReportHandleLog({
    reportId,
    reviewerId,
    handleAction: hideContent ? 'resolve_hide' : 'resolve',
    handleComment: resolution,
    beforeStatus: row.status,
    afterStatus: REPORT_STATUS.RESOLVED,
  })
  return getAdminReportDetail(reportId)
}

module.exports = {
  listAdminReports,
  getAdminReportDetail,
  acceptAdminReport,
  rejectAdminReport,
  resolveAdminReport,
  offlinePublicCasePreservingSnapshot,
  buildReportOfflineAuditComment,
}
