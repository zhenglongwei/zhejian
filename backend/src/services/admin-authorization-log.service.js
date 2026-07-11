const { prisma } = require('../lib/prisma')
const { maskPhone, toIso } = require('../lib/ids')

const AUTH_TYPE_LABEL = {
  login: '登录注册',
  consult_transfer: '咨询转接',
  accident_ack: '事故车知晓',
  album_claim: '相册关联',
  case_public: '案例公开',
  desensitize_confirm: '脱敏确认',
  case_revoke: '撤回公开',
  merchant_onboard: '商家入驻',
  merchant_history: '商家历史案例',
  subscription_pay: '套餐支付',
  album_review: '相册反馈',
  review_public: '反馈公开',
  part_verify: '配件验真',
  album_feedback: '反馈转达',
  report: '内容举报',
  deactivate: '账户注销',
}

function truncateSnapshot(text, maxLen = 120) {
  const value = String(text || '')
  if (value.length <= maxLen) return value
  return `${value.slice(0, maxLen)}…`
}

function formatListItem(row, user) {
  return {
    id: row.id,
    userId: row.userId,
    userNickname: user?.nickname || '用户',
    userPhoneMasked: maskPhone(user?.phone || ''),
    authType: row.authType,
    authTypeLabel: AUTH_TYPE_LABEL[row.authType] || row.authType,
    businessId: row.businessId || '',
    authStatus: row.authStatus,
    authTextVersion: row.authTextVersion,
    authTextSnapshotPreview: truncateSnapshot(row.authTextSnapshot),
    clientType: row.clientType,
    ip: row.ip || '',
    remark: row.remark || '',
    authTime: toIso(row.authTime),
    createdAt: toIso(row.createdAt),
  }
}

function formatDetailItem(row, user) {
  return {
    ...formatListItem(row, user),
    authTextSnapshot: row.authTextSnapshot,
    deviceInfo: row.deviceInfo || '',
    revokeTime: toIso(row.revokeTime),
  }
}

async function listAdminAuthorizationLogs(query = {}) {
  if (!prisma.authorizationLog) {
    return { list: [], page: 1, pageSize: 20, total: 0 }
  }

  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20))
  const where = {}

  const userId = String(query.userId || '').trim()
  if (userId) where.userId = userId

  const authType = String(query.authType || '').trim()
  if (authType) where.authType = authType

  const businessId = String(query.businessId || '').trim()
  if (businessId) where.businessId = businessId

  const [rows, total] = await Promise.all([
    prisma.authorizationLog.findMany({
      where,
      orderBy: { authTime: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.authorizationLog.count({ where }),
  ])

  const userIds = [...new Set(rows.map((row) => row.userId))]
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, nickname: true, phone: true },
      })
    : []
  const userMap = new Map(users.map((user) => [user.id, user]))

  return {
    list: rows.map((row) => formatListItem(row, userMap.get(row.userId))),
    page,
    pageSize,
    total,
  }
}

async function getAdminAuthorizationLogDetail(logId) {
  if (!prisma.authorizationLog) {
    const err = new Error('授权留痕表未就绪')
    err.status = 503
    throw err
  }

  const row = await prisma.authorizationLog.findUnique({ where: { id: logId } })
  if (!row) {
    const err = new Error('授权记录不存在')
    err.status = 404
    throw err
  }

  const user = await prisma.user.findUnique({
    where: { id: row.userId },
    select: { id: true, nickname: true, phone: true },
  })

  return formatDetailItem(row, user)
}

module.exports = {
  listAdminAuthorizationLogs,
  getAdminAuthorizationLogDetail,
}
