const {
  SERVICE_ALBUM_STATUS_LABEL,
  SERVICE_ALBUM_STATUS_VARIANT,
} = require('../constants/service-album-status')
const {
  buildPrivateAlbumPrice,
  formatPlanAmountLabel,
} = require('./album-price')
const { canShareToOwner } = require('./service-album-share')

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
  const summaryRows = Array.isArray(item.summaryRows)
    ? item.summaryRows.slice()
    : []
  if (
    privatePrice.planAmount != null &&
    !summaryRows.some((row) => row.label === '参考报价')
  ) {
    summaryRows.splice(Math.min(3, summaryRows.length), 0, {
      label: '参考报价',
      value: formatPlanAmountLabel(privatePrice.planAmount),
    })
  }

  return {
    ...base,
    ...privatePrice,
    summaryRows,
    authPendingBadge:
      item.status === 'completed' && item.publicCaseStatus === 'private'
        ? '可授权'
        : '',
    publicLabel: item.isPublic ? '已授权' : '',
  }
}

function enrichMerchantAlbumListItem(item) {
  const base = enrichServiceAlbumListItem(item, { audience: 'merchant' })
  return {
    ...base,
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
}
