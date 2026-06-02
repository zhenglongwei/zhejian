const { prisma } = require('../lib/prisma')
const { newId, toIso } = require('../lib/ids')
const { assertPersistentImageUrl } = require('../lib/media-storage')
const { getServiceDetail, getCaseDetail } = require('./content.service')
const {
  VALID_TARGET_TYPES,
  VALID_REPORT_TYPES,
  REPORT_STATUS,
  REPORT_RATE_LIMIT_MS,
} = require('../constants/report')

function mapReportRecord(row) {
  return {
    id: row.id,
    targetType: row.targetType,
    targetId: row.targetId,
    targetTitle: row.targetTitle,
    reportType: row.reportType,
    description: row.description,
    images: row.imagesJson || [],
    contactPhone: row.contactPhone,
    status: row.status,
    createdAt: toIso(row.createdAt),
  }
}

function sanitizeReportImages(images) {
  if (!Array.isArray(images)) return []
  return images.slice(0, 3).map((url) => assertPersistentImageUrl(url)).filter(Boolean)
}

async function assertReportTarget(targetType, targetId) {
  if (!VALID_TARGET_TYPES.has(targetType)) {
    const err = new Error('举报对象类型无效')
    err.status = 400
    throw err
  }
  if (!targetId) {
    const err = new Error('缺少举报对象')
    err.status = 400
    throw err
  }

  if (targetType === 'service') {
    const detail = await getServiceDetail(targetId)
    return detail.name || detail.title || ''
  }

  const detail = await getCaseDetail(targetId)
  return detail.title || ''
}

async function createReport(userId, payload = {}) {
  const targetType = String(payload.targetType || '').trim()
  const targetId = String(payload.targetId || '').trim()
  const reportType = String(payload.reportType || '').trim()
  const description = String(payload.description || '').trim()
  const contactPhone = String(payload.contactPhone || '').replace(/\D/g, '')

  if (!payload.consent) {
    const err = new Error('请先阅读并勾选举报声明')
    err.status = 400
    throw err
  }
  if (!VALID_REPORT_TYPES.has(reportType)) {
    const err = new Error('请选择举报类型')
    err.status = 400
    throw err
  }
  if (description.length < 10 || description.length > 500) {
    const err = new Error('问题说明需 10–500 字')
    err.status = 400
    throw err
  }
  if (contactPhone && contactPhone.length !== 11) {
    const err = new Error('联系手机号格式不正确')
    err.status = 400
    throw err
  }

  const targetTitle = await assertReportTarget(targetType, targetId)
  const since = new Date(Date.now() - REPORT_RATE_LIMIT_MS)
  const recent = await prisma.contentReport.findFirst({
    where: {
      userId,
      targetType,
      targetId,
      createdAt: { gte: since },
    },
  })
  if (recent) {
    const err = new Error('你已举报过该内容，请 24 小时后再试')
    err.status = 429
    throw err
  }

  const row = await prisma.contentReport.create({
    data: {
      id: newId('rpt'),
      userId,
      targetType,
      targetId,
      targetTitle: payload.targetTitle || targetTitle || '',
      reportType,
      description,
      imagesJson: sanitizeReportImages(payload.images),
      contactPhone,
      status: REPORT_STATUS.PENDING,
    },
  })

  return mapReportRecord(row)
}

module.exports = {
  createReport,
  mapReportRecord,
}
