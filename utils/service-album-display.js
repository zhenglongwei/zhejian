const {
  SERVICE_ALBUM_STATUS,
  SERVICE_ALBUM_STATUS_LABEL,
  SERVICE_ALBUM_STATUS_VARIANT,
} = require('../constants/service-album-status')
const {
  buildPrivateAlbumPrice,
} = require('./album-price')
const { canShareToOwner } = require('./service-album-share')

function stripPriceSummaryRow(rows = []) {
  return rows.filter(
    (row) => row.label !== '参考报价' && row.label !== '方案报价'
  )
}

function formatAlbumDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

/** 商家端展示：完工前统一「进行中」，完工后统一「已完工」（内部 status 不变，供 Tab 筛选） */
const MERCHANT_ALBUM_DONE_STATUSES = [
  SERVICE_ALBUM_STATUS.COMPLETED,
  SERVICE_ALBUM_STATUS.PENDING_AUTHORIZATION,
  SERVICE_ALBUM_STATUS.PENDING_REVIEW,
  SERVICE_ALBUM_STATUS.PUBLISHED,
]

function resolveMerchantAlbumDisplayStatus(rawStatus) {
  if (MERCHANT_ALBUM_DONE_STATUSES.includes(rawStatus)) {
    return {
      statusLabel: SERVICE_ALBUM_STATUS_LABEL[SERVICE_ALBUM_STATUS.COMPLETED],
      statusVariant: SERVICE_ALBUM_STATUS_VARIANT[SERVICE_ALBUM_STATUS.COMPLETED],
    }
  }
  return {
    statusLabel: SERVICE_ALBUM_STATUS_LABEL[SERVICE_ALBUM_STATUS.IN_PROGRESS],
    statusVariant: SERVICE_ALBUM_STATUS_VARIANT[SERVICE_ALBUM_STATUS.IN_PROGRESS],
  }
}

function enrichServiceAlbumListItem(item, options = {}) {
  const audience = options.audience || 'user'
  const status =
    item.status || (audience === 'merchant' ? 'draft' : 'in_progress')
  const base = {
    ...item,
    status,
    statusLabel: SERVICE_ALBUM_STATUS_LABEL[status] || status,
    statusVariant: SERVICE_ALBUM_STATUS_VARIANT[status] || 'default',
    createdAtText: formatAlbumDateTime(item.createdAt),
    updatedAtText: item.updatedAtText || formatAlbumDateTime(item.updatedAt),
  }

  if (audience === 'merchant') {
    return base
  }

  const privatePrice = buildPrivateAlbumPrice(item)
  const summaryRows = stripPriceSummaryRow(
    Array.isArray(item.summaryRows) ? item.summaryRows.slice() : []
  )

  return {
    ...base,
    ...privatePrice,
    summaryRows,
    summaryRowsForDisplay: summaryRows,
    authPendingBadge:
      item.status === 'completed' && item.publicCaseStatus === 'private'
        ? '可授权'
        : '',
    publicLabel: item.isPublic ? '已授权' : '',
  }
}

function enrichMerchantAlbumListItem(item) {
  const base = enrichServiceAlbumListItem(item, { audience: 'merchant' })
  const display = resolveMerchantAlbumDisplayStatus(base.status)
  return {
    ...base,
    statusLabel: display.statusLabel,
    statusVariant: display.statusVariant,
    canShareToOwner: canShareToOwner(item),
  }
}

const AUTH_STATUS_LABEL = {
  pending_review: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  withdrawn: '已撤回',
}

const AUTH_STATUS_VARIANT = {
  pending_review: 'info',
  approved: 'success',
  rejected: 'default',
  withdrawn: 'default',
}

function buildAuthorizationTags(authStatus) {
  const base = [
    { variant: 'order', text: '已授权' },
    { variant: 'desensitized', text: '已脱敏' },
  ]
  if (authStatus === 'approved') {
    return [...base, { variant: 'audited', text: '已审核' }]
  }
  if (authStatus === 'pending_review') {
    return [...base, { variant: 'info', text: '待审核' }]
  }
  if (authStatus === 'rejected') {
    return base
  }
  return base
}

function enrichAuthorizationItem(item) {
  const authStatus = item.authStatus || 'none'
  return {
    ...item,
    authStatusLabel: AUTH_STATUS_LABEL[authStatus] || authStatus,
    authStatusVariant: AUTH_STATUS_VARIANT[authStatus] || 'default',
    updatedAtText: formatAlbumDateTime(item.updatedAt),
    displayTags: buildAuthorizationTags(authStatus),
  }
}

function buildPendingConfirmSummary(pendingConfirms = []) {
  return (pendingConfirms || []).map((item, index) => {
    const label = item.title || item.partName || '待确认项'
    return {
      ...item,
      index: index + 1,
      label,
      cellTitle: `${index + 1}. ${label}`,
    }
  })
}

module.exports = {
  enrichServiceAlbumListItem,
  enrichMerchantAlbumListItem,
  enrichAuthorizationItem,
  buildPendingConfirmSummary,
  formatAlbumDateTime,
  resolveMerchantAlbumDisplayStatus,
  stripPriceSummaryRow,
}
