const {
  SERVICE_ALBUM_STATUS,
  SERVICE_ALBUM_STATUS_LABEL,
  SERVICE_ALBUM_STATUS_VARIANT,
  SERVICE_ALBUM_REPAIR_DONE_STATUSES,
  ALBUM_VISIBILITY_LABEL,
  ALBUM_VISIBILITY_VARIANT,
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

function isRepairCompleted(status) {
  return SERVICE_ALBUM_REPAIR_DONE_STATUSES.includes(status)
}

/** 维修进度：维修中 / 已完工（与公示态解耦） */
function resolveRepairProgress(status) {
  if (isRepairCompleted(status)) {
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

/** 相册可见性：私密相册 / 审核中 / 公开相册 */
function resolveAlbumVisibility(publicCaseStatus) {
  const key = publicCaseStatus || 'private'
  return {
    visibilityLabel: ALBUM_VISIBILITY_LABEL[key] || ALBUM_VISIBILITY_LABEL.private,
    visibilityVariant: ALBUM_VISIBILITY_VARIANT[key] || ALBUM_VISIBILITY_VARIANT.private,
  }
}

function resolveUserAlbumDisplay(status, publicCaseStatus) {
  const repair = resolveRepairProgress(status)
  const visibility = isRepairCompleted(status)
    ? resolveAlbumVisibility(publicCaseStatus)
    : { visibilityLabel: '', visibilityVariant: 'default' }
  return { ...repair, ...visibility }
}

/** 商家端展示：完工前「进行中」，完工后「已完工」 */
function resolveMerchantAlbumDisplayStatus(rawStatus) {
  if (isRepairCompleted(rawStatus)) {
    return {
      statusLabel: SERVICE_ALBUM_STATUS_LABEL[SERVICE_ALBUM_STATUS.COMPLETED],
      statusVariant: SERVICE_ALBUM_STATUS_VARIANT[SERVICE_ALBUM_STATUS.COMPLETED],
    }
  }
  return {
    statusLabel: '进行中',
    statusVariant: SERVICE_ALBUM_STATUS_VARIANT[SERVICE_ALBUM_STATUS.IN_PROGRESS],
  }
}

function enrichServiceAlbumListItem(item, options = {}) {
  const audience = options.audience || 'user'
  const listTab = options.listTab || 'private'
  const status =
    item.status || (audience === 'merchant' ? 'draft' : 'in_progress')
  const base = {
    ...item,
    status,
    createdAtText: formatAlbumDateTime(item.createdAt),
    updatedAtText: item.updatedAtText || formatAlbumDateTime(item.updatedAt),
  }

  if (audience === 'merchant') {
    const display = resolveMerchantAlbumDisplayStatus(status)
    return {
      ...base,
      statusLabel: display.statusLabel,
      statusVariant: display.statusVariant,
    }
  }

  const privatePrice = buildPrivateAlbumPrice(item)
  const summaryRows = stripPriceSummaryRow(
    Array.isArray(item.summaryRows) ? item.summaryRows.slice() : []
  )

  // 列表：私密 Tab 仅展示维修进度；公开 Tab 不展示状态 Tag
  if (listTab === 'public') {
    return {
      ...base,
      statusLabel: '',
      statusVariant: 'default',
      visibilityLabel: '',
      visibilityVariant: 'default',
      ...privatePrice,
      summaryRows,
      summaryRowsForDisplay: summaryRows,
    }
  }

  const repair = resolveRepairProgress(status)
  const publicCaseStatus = item.publicCaseStatus || 'private'
  const reviewTag =
    publicCaseStatus === 'pending_review'
      ? {
          visibilityLabel: ALBUM_VISIBILITY_LABEL.pending_review,
          visibilityVariant: ALBUM_VISIBILITY_VARIANT.pending_review,
        }
      : { visibilityLabel: '', visibilityVariant: 'default' }

  return {
    ...base,
    statusLabel: repair.statusLabel,
    statusVariant: repair.statusVariant,
    ...reviewTag,
    ...privatePrice,
    summaryRows,
    summaryRowsForDisplay: summaryRows,
  }
}

function enrichMerchantAlbumListItem(item) {
  const base = enrichServiceAlbumListItem(item, { audience: 'merchant' })
  return {
    ...base,
    canShareToOwner: canShareToOwner(item),
  }
}

function buildAuthorizationTags(publicCaseStatus) {
  const key = publicCaseStatus || 'private'
  if (key === 'public_approved') {
    return [{ variant: 'success', text: '公开相册' }]
  }
  if (key === 'pending_review') {
    return [{ variant: 'info', text: '审核中' }]
  }
  return [{ variant: 'default', text: '私密相册' }]
}

function enrichAuthorizationItem(item) {
  const publicCaseStatus =
    item.publicCaseStatus ||
    (item.authStatus === 'approved'
      ? 'public_approved'
      : item.authStatus === 'pending_review'
        ? 'pending_review'
        : 'private')
  return {
    ...item,
    publicCaseStatus,
    updatedAtText: formatAlbumDateTime(item.updatedAt),
    displayTags: buildAuthorizationTags(publicCaseStatus),
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
  resolveUserAlbumDisplay,
  resolveRepairProgress,
  resolveAlbumVisibility,
  isRepairCompleted,
  stripPriceSummaryRow,
}
