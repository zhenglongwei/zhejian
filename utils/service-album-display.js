const {
  SERVICE_ALBUM_STATUS,
  SERVICE_ALBUM_STATUS_LABEL,
  SERVICE_ALBUM_STATUS_VARIANT,
  SERVICE_ALBUM_REPAIR_DONE_STATUSES,
  ALBUM_VISIBILITY_LABEL,
  ALBUM_VISIBILITY_VARIANT,
} = require('../constants/service-album-status')
const { SERVICE_ALBUM_STAGES } = require('../constants/service-album-stages')
const {
  buildPrivateAlbumPrice,
} = require('./album-price')
const { canShareToOwner } = require('./service-album-share')
const { canOwnerShareAlbum } = require('./album-owner-share')
const { resolveImageSrc, resolveMediaUrl } = require('./desensitize-url')
const { isAlbumUnread } = require('./album-unread-hint')
const { formatArchivalDateText } = require('./album-summary')
const {
  buildAlbumGateBanner,
  buildGateActionButtons,
} = require('./album-gate-actions')

function resolveAlbumCoverUrl(item = {}) {
  if (item.coverUrl) {
    const resolved = resolveImageSrc(item.coverUrl)
    if (resolved) return resolved
    const media = resolveMediaUrl(item.coverUrl)
    if (media) return media
  }
  const nodes = item.nodes || []
  for (let i = 0; i < nodes.length; i += 1) {
    const images = nodes[i].images || []
    for (let j = 0; j < images.length; j += 1) {
      const resolved = resolveImageSrc(images[j])
      if (resolved) return resolved
      const media = resolveMediaUrl(images[j])
      if (media) return media
    }
  }
  return ''
}

function buildAlbumListStageProgress(item = {}) {
  if (Array.isArray(item.stageProgress) && item.stageProgress.length) {
    return item.stageProgress
  }
  const nodeById = {}
  ;(item.nodes || []).forEach((node) => {
    if (node && node.id) nodeById[node.id] = node
  })
  return SERVICE_ALBUM_STAGES.map((stage) => {
    const node = nodeById[stage.id]
    const filled =
      Boolean(node) &&
      ((node.images || []).length > 0 || String(node.note || '').trim())
    return {
      id: stage.id,
      title: stage.title,
      filled,
    }
  })
}

function buildAlbumMetaLine(item = {}) {
  const parts = []
  const serviceRaw = item.serviceNameRaw || ''
  const listTitle = item.listTitle || ''
  if (serviceRaw && listTitle && serviceRaw !== listTitle) {
    parts.push(serviceRaw)
  }
  if (item.vehicleDisplay) {
    const plate = String((item.vehicle && item.vehicle.plate) || '').trim()
    if (!plate || item.vehicleDisplay.indexOf(plate) === -1) {
      parts.push(item.vehicleDisplay)
    } else if (!serviceRaw) {
      parts.push(item.vehicleDisplay)
    }
  }
  const count = Number(item.imageCount) || 0
  if (count > 0) parts.push(`${count} 张`)
  return parts.join(' · ')
}

function resolveAlbumAuthAction(item = {}) {
  const { AUTH_ACTION_LABEL } = require('./publish-thank-you')
  if (!isRepairCompleted(item.status)) {
    return { show: false, label: '', disabled: false, hint: '' }
  }
  if (item.publicCaseScorePass === false || item.publicCaseQualityReady === false) {
    return { show: false, label: '', disabled: false, hint: '' }
  }
  if (item.compliancePendingHint) {
    return {
      show: true,
      label: AUTH_ACTION_LABEL,
      disabled: true,
      hint: item.compliancePendingHint,
    }
  }
  if (item.complianceRejectReason) {
    return {
      show: false,
      label: '',
      disabled: true,
      hint: '门店案例未通过审核，请等待门店修改后重试',
    }
  }
  const status = item.publicCaseStatus || 'private'
  if (status === 'need_modify' && item.canResubmitPublicCase) {
    return {
      show: true,
      label: '重新分享脱敏报告',
      disabled: false,
      hint: item.gateBRejectHint || '',
    }
  }
  if (status === 'pending_review' || status === 'rejected') {
    return { show: false, label: '', disabled: false, hint: '' }
  }
  if (status === 'public_approved') {
    return { show: false, label: '', disabled: false, hint: '' }
  }
  // 质量未达标 / 不可授权：不展示「发布到网站」，避免误导
  if (
    item.canAuthorizePublicCase === false ||
    item.publicCaseScorePass === false ||
    item.publicCaseQualityReady === false
  ) {
    return { show: false, label: '', disabled: false, hint: '' }
  }
  if (
    status === 'private' ||
    status === 'review_passed' ||
    status === 'offline' ||
    status === 'authorization_pending' ||
    status === 'user_rejected'
  ) {
    return {
      show: true,
      label: AUTH_ACTION_LABEL,
      disabled: false,
      hint: item.awaitingUserConfirm && item.userConfirmHint ? item.userConfirmHint : '',
    }
  }
  return { show: false, label: '', disabled: false, hint: '' }
}

function resolveAlbumWithdrawAction(item = {}) {
  // 以后端 canWithdraw 为准：须已授权且已上网；案例审通过未发布不可撤回
  if (item.canWithdraw === true) {
    return {
      show: true,
      label: '撤回发布',
      disabled: Boolean(item.withdrawing),
    }
  }
  if (item.canWithdraw === false) {
    return { show: false, label: '', disabled: false }
  }
  const status = item.publicCaseStatus || 'private'
  const authorized =
    item.isAuthorized === true ||
    item.authorizationStatus === 'authorized' ||
    (item.authorization && item.authorization.status === 'authorized')
  if (authorized && (status === 'public_approved' || status === 'need_modify')) {
    return {
      show: true,
      label: '撤回发布',
      disabled: Boolean(item.withdrawing),
    }
  }
  return { show: false, label: '', disabled: false }
}

function resolveListAlbumActions(item = {}) {
  const withdrawAction = resolveAlbumWithdrawAction(item)
  if (withdrawAction.show) {
    return {
      authAction: { show: false, label: '', disabled: false, hint: '' },
      withdrawAction,
    }
  }
  return {
    authAction: resolveAlbumAuthAction(item),
    withdrawAction,
  }
}

/** 用户相册列表卡 · 案例审 inline 提示（不表示相册不可进） */
function resolveAlbumListStatusHint(item = {}, authAction = {}) {
  if (item.compliancePendingHint) return item.compliancePendingHint
  if (item.publicCaseStatus === 'pending_desensitize') {
    return '门店案例配图处理中'
  }
  if (item.publicCaseStatus === 'pending_review') {
    return '门店案例审核中'
  }
  if (item.publicCaseStatus === 'rejected' || item.complianceRejectReason) {
    return '门店案例未通过审核，请等待门店修改'
  }
  if (authAction.hint) return authAction.hint
  if (item.complianceRejectReason) {
    return '门店案例未通过审核，请等待门店修改后重试'
  }
  if (item.publicCaseStatus === 'need_modify' && item.gateBRejectHint) {
    return item.gateBRejectHint
  }
  if (item.publicCaseStatus === 'rejected') {
    return '门店案例未通过审核，请等待门店修改后重试'
  }
  return ''
}

function resolveUserAlbumShareVisible(item = {}) {
  const canOwnerShare = canOwnerShareAlbum({
    albumId: item.albumId,
    status: item.status,
    imageCount: item.imageCount,
  })
  return canOwnerShare || item.publicCaseStatus === 'public_approved'
}

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

function resolveCoverInitial(item = {}) {
  const name = String(item.serviceName || '').trim()
  if (!name) return '档'
  return name.charAt(0)
}

function appendAlbumListPresentation(item, base = {}) {
  const merged = { ...item, ...base }
  const coverUrl = resolveAlbumCoverUrl(merged)
  const coverInitial = resolveCoverInitial(merged)
  const stageProgress = buildAlbumListStageProgress(merged)
  const { authAction, withdrawAction } = resolveListAlbumActions(merged)
  const statusHint = resolveAlbumListStatusHint(merged, authAction)
  const hasUnreadUpdate = Boolean(base.hasUnreadUpdate)
  return {
    ...base,
    coverUrl,
    coverInitial,
    metaLine: buildAlbumMetaLine(merged),
    deliverDateText: merged.deliverDateText || '',
    archivalDateText:
      merged.archivalDateText ||
      formatArchivalDateText(merged.createdAt || merged.updatedAt),
    summaryLine: merged.summaryLine || '',
    stageProgress,
    authAction,
    withdrawAction,
    statusHint,
    showShareButton: resolveUserAlbumShareVisible(merged),
    hasUnreadUpdate,
    showPartVerifyLink: false,
    partVerifySummaryLabel:
      (merged.partVerifySummary && merged.partVerifySummary.label) || '',
    pendingOwnerReview: Boolean(merged.pendingOwnerReview),
    reviewEligible: Boolean(merged.reviewEligible),
    hasReview: Boolean(merged.hasReview),
  }
}

function enrichServiceAlbumListItem(item, options = {}) {
  const audience = options.audience || 'user'
  const listTab = options.listTab || 'all'
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
    return appendAlbumListPresentation(item, {
      ...base,
      statusLabel: display.statusLabel,
      statusVariant: display.statusVariant,
    })
  }

  const privatePrice = buildPrivateAlbumPrice(item)
  const summaryRowsFull = Array.isArray(item.summaryRows) ? item.summaryRows.slice() : []
  const summaryRowsForDisplay = stripPriceSummaryRow(summaryRowsFull)
  const unreadBase = {
    hasUnreadUpdate: !isRepairCompleted(status) && isAlbumUnread(item),
  }

  // 已完工 Tab：旅程已收口到过审，不展示维修进度 Tag
  if (listTab === 'done') {
    return appendAlbumListPresentation(item, {
      ...base,
      ...unreadBase,
      statusLabel: '',
      statusVariant: 'default',
      visibilityLabel: '',
      visibilityVariant: 'default',
      ...privatePrice,
      summaryRows: summaryRowsFull,
      summaryRowsForDisplay,
    })
  }

  const repair = resolveRepairProgress(status)

  return appendAlbumListPresentation(item, {
    ...base,
    ...unreadBase,
    statusLabel: repair.statusLabel,
    statusVariant: repair.statusVariant,
    visibilityLabel: '',
    visibilityVariant: 'default',
    ...privatePrice,
    summaryRows: summaryRowsFull,
    summaryRowsForDisplay,
  })
}

function resolveMerchantAlbumListTitle(item = {}) {
  const vehicle = item.vehicle || {}
  const plate = String(vehicle.plate || '').trim()
  if (plate) return plate
  const plateDisplay = String(vehicle.plateDisplay || '').trim()
  if (plateDisplay) return plateDisplay
  const vehicleDisplay = String(item.vehicleDisplay || '').trim()
  if (vehicleDisplay && vehicleDisplay !== '—') return vehicleDisplay
  return item.serviceName || '服务相册'
}

function enrichMerchantAlbumListItem(item) {
  const base = enrichServiceAlbumListItem(item, { audience: 'merchant' })
  const { resolveAlbumHasOwner } = require('./merchant-album-nav')
  const listTitle = resolveMerchantAlbumListTitle(base)
  const withTitle = {
    ...base,
    listTitle,
    serviceNameRaw: item.serviceName || base.serviceName || '',
    serviceName: listTitle,
  }
  return {
    ...withTitle,
    metaLine: buildAlbumMetaLine(withTitle),
    hasOwner: resolveAlbumHasOwner(base),
    canShareToOwner: canShareToOwner(item),
  }
}

function buildAuthorizationTags(publicCaseStatus, options = {}) {
  if (options.needsAuthorization) {
    return [{ variant: 'warning', text: '待发布' }]
  }
  const key = publicCaseStatus || 'private'
  if (key === 'public_approved') {
    return [{ variant: 'success', text: '公开相册' }]
  }
  if (key === 'pending_review') {
    return [{ variant: 'info', text: '审核中' }]
  }
  if (key === 'need_modify') {
    return [{ variant: 'warning', text: '需修改后重提' }]
  }
  if (key === 'user_rejected') {
    return [{ variant: 'warning', text: '审核未通过' }]
  }
  return [{ variant: 'default', text: '私密相册' }]
}

function resolveAuthorizationCardAction(item = {}) {
  const status = item.publicCaseStatus || 'private'
  const withdraw = resolveAlbumWithdrawAction(item)

  if (withdraw.show) {
    return {
      action: 'withdraw',
      label: '撤回授权',
      buttonType: 'ghost',
      disabled: withdraw.disabled,
    }
  }

  if (
    item.canAuthorizePublicCase === false ||
    item.publicCaseScorePass === false ||
    item.publicCaseQualityReady === false
  ) {
    return { action: '', label: '', buttonType: 'ghost', disabled: true }
  }

  if (
    item.needsAuthorization ||
    item.canAuthorizePublicCase === true ||
    status === 'private' ||
    status === 'review_passed' ||
    status === 'offline' ||
    status === 'authorization_pending' ||
    status === 'user_rejected'
  ) {
    return {
      action: 'authorize',
      label: '发布到公开网站',
      buttonType: 'secondary',
      disabled: false,
    }
  }

  return { action: '', label: '', buttonType: 'ghost', disabled: true }
}

function enrichAuthorizationItem(item) {
  const publicCaseStatus =
    item.publicCaseStatus ||
    (item.authStatus === 'approved'
      ? 'public_approved'
      : item.authStatus === 'pending_review'
        ? 'pending_review'
        : 'private')
  const cardAction = resolveAuthorizationCardAction({ ...item, publicCaseStatus })
  return {
    ...item,
    publicCaseStatus,
    updatedAtText: formatAlbumDateTime(item.updatedAt),
    displayTags: buildAuthorizationTags(publicCaseStatus, {
      needsAuthorization: Boolean(item.needsAuthorization),
    }),
    cardAction,
  }
}

/** 授权列表页 · 与相册列表同构（ui-album-card） */
function enrichAuthorizationAlbumItem(item) {
  const publicCaseStatus = item.publicCaseStatus || 'private'
  const listTab =
    publicCaseStatus === 'review_passed' ||
    publicCaseStatus === 'public_approved' ||
    publicCaseStatus === 'offline'
      ? 'done'
      : 'active'
  const base = enrichServiceAlbumListItem(item, { audience: 'user', listTab })
  const cardAction = resolveAuthorizationCardAction({ ...item, publicCaseStatus })

  let authAction = { show: false, label: '', disabled: false, hint: '' }
  let withdrawAction = { show: false, label: '', disabled: false }
  if (cardAction.action === 'withdraw') {
    withdrawAction = {
      show: true,
      label: cardAction.label,
      disabled: cardAction.disabled || Boolean(item.withdrawing),
    }
  } else if (cardAction.action === 'authorize') {
    authAction = {
      show: true,
      label: cardAction.label,
      disabled: cardAction.disabled,
      hint: '',
    }
  }

  const visibility = isRepairCompleted(item.status)
    ? resolveAlbumVisibility(publicCaseStatus)
    : { visibilityLabel: '', visibilityVariant: 'default' }
  const needsAuth = Boolean(item.needsAuthorization)

  return {
    ...base,
    showShareButton: false,
    authAction,
    withdrawAction,
    statusLabel: needsAuth ? '待发布到公开网站' : base.statusLabel,
    statusVariant: needsAuth ? 'warning' : 'default',
    visibilityLabel: visibility.visibilityLabel,
    visibilityVariant:
      visibility.visibilityLabel === '审核中'
        ? visibility.visibilityVariant
        : 'default',
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
  enrichAuthorizationAlbumItem,
  buildPendingConfirmSummary,
  formatAlbumDateTime,
  resolveMerchantAlbumDisplayStatus,
  resolveUserAlbumDisplay,
  resolveRepairProgress,
  resolveAlbumVisibility,
  isRepairCompleted,
  stripPriceSummaryRow,
  resolveAlbumCoverUrl,
  buildAlbumListStageProgress,
  buildAlbumMetaLine,
  resolveAlbumAuthAction,
  resolveAlbumListStatusHint,
  resolveAlbumWithdrawAction,
  resolveListAlbumActions,
  resolveAuthorizationCardAction,
  buildAlbumGateBanner,
  buildGateActionButtons,
}
