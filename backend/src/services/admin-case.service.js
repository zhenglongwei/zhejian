const { prisma } = require('../lib/prisma')
const { newId, toIso } = require('../lib/ids')
const { PUBLIC_CASE_STATUS, RISK_LEVEL_ORDER } = require('../constants/v2')
const { resolveDisplayMediaUrl, resolvePublicCaseMediaUrl } = require('../lib/media-url')
const {
  buildPublicCasePrice,
  formatPlanAmountLabel,
  buildPublicCaseDbPriceColumns,
} = require('../utils/album-price')
const { getTaskById, retryAsset } = require('./desensitize.service')
const { ASSET_STATUS } = require('./desensitize.constants')
const { getMediaById } = require('./media.service')
const { buildPreMaskTaskId } = require('./desensitize.constants')
const { listPrivacyDetectionsByImageId } = require('./privacy-detection.service')
const { ensureMediaRecordFromUrl } = require('./media.service')
const { buildCaseDraft, resolvePublishTask } = require('./public-case.service')
const { buildAlbumView } = require('./service-album.service')
const { buildCaseArticlePayload } = require('./case-article-generator.service')
const { stampPublishedH5OnPayload } = require('./case-article-publish.service')
const { ensureUniqueCaseSlug, resolveCaseCanonicalPath } = require('../utils/case-slug')

const RISK_RANK = RISK_LEVEL_ORDER

function resolveCaseSource(album) {
  if (!album) return 'user_authorized'
  if (album.authorization?.status === 'authorized') return 'user_authorized'
  const hasOwner =
    Boolean(String(album.userId || '').trim()) || Boolean(String(album.userPhone || '').trim())
  if (!hasOwner) return 'cold_start'
  return 'merchant_history'
}

function sourceLabel(source) {
  const map = {
    cold_start: '冷启动',
    user_authorized: '用户授权案例',
    merchant_history: '商家历史案例',
  }
  return map[source] || source
}

function maxRiskLevel(levels) {
  let best = ''
  let bestRank = 0
  ;(levels || []).forEach((level) => {
    const key = String(level || '').toLowerCase()
    const rank = RISK_RANK[key] || 0
    if (rank > bestRank) {
      bestRank = rank
      best = key
    }
  })
  return best || 'low'
}

function isHighRisk(level) {
  const rank = RISK_RANK[String(level || '').toLowerCase()] || 0
  return rank >= RISK_RANK.medium
}

async function loadPreMaskTask(albumId) {
  const taskId = buildPreMaskTaskId(albumId)
  return getTaskById(taskId, { includeDetections: true, roles: ['system'] })
}

function aggregateTaskRisk(task) {
  const assets = task?.rawAssets || []
  const levels = assets.map((a) => a.riskLevel).filter(Boolean)
  const tags = new Set()
  assets.forEach((a) => {
    ;(a.riskTags || []).forEach((t) => tags.add(t))
  })
  return {
    riskLevel: maxRiskLevel(levels),
    riskTags: [...tags],
    imageCount: assets.length,
  }
}

function buildListWhere(query = {}) {
  const tab = String(query.tab || 'pending').toLowerCase()
  const where = {}

  if (tab === 'pending') {
    where.status = PUBLIC_CASE_STATUS.PENDING_REVIEW
  } else if (tab === 'approved') {
    where.status = PUBLIC_CASE_STATUS.PUBLIC_APPROVED
  } else if (tab === 'rejected') {
    where.status = {
      in: [PUBLIC_CASE_STATUS.REJECTED, PUBLIC_CASE_STATUS.USER_REJECTED],
    }
  } else if (tab === 'need_modify') {
    where.status = PUBLIC_CASE_STATUS.NEED_MODIFY
  } else if (tab === 'high_risk') {
    where.status = PUBLIC_CASE_STATUS.PENDING_REVIEW
  } else {
    where.status = PUBLIC_CASE_STATUS.PENDING_REVIEW
  }

  if (query.storeId) where.storeId = String(query.storeId)
  if (query.keyword) {
    where.title = { contains: String(query.keyword) }
  }

  return { tab, where }
}

async function listAdminCases(query = {}) {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20))
  const { tab, where } = buildListWhere(query)

  const rows = await prisma.publicCase.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      album: {
        include: { authorization: true },
      },
    },
  })

  const items = []
  for (const row of rows) {
    const album = row.album
    const source = album ? resolveCaseSource(album) : 'user_authorized'
    let riskLevel = 'low'
    let imageCount = 0
    if (album) {
      const task = await loadPreMaskTask(album.id)
      const agg = aggregateTaskRisk(task)
      riskLevel = agg.riskLevel
      imageCount = album.imageCount || agg.imageCount
    }
    if (query.source && query.source !== source) continue
    if (tab === 'high_risk' && !isHighRisk(riskLevel)) continue
    if (query.riskLevel && query.riskLevel !== riskLevel) continue

    items.push({
      caseId: row.id,
      albumId: row.albumId,
      title: row.title,
      source,
      sourceLabel: sourceLabel(source),
      storeId: row.storeId,
      storeName: row.storeName,
      serviceName: row.serviceName,
      status: row.status,
      riskLevel,
      imageCount,
      authorizationStatus: album?.authorization?.status || '',
      submittedAt: toIso(row.updatedAt),
      createdAt: toIso(row.createdAt),
    })
  }

  let total = await prisma.publicCase.count({ where })
  if (tab === 'high_risk' || query.source || query.riskLevel) {
    total = items.length
  }

  return {
    list: items,
    page,
    pageSize,
    total,
    tab,
  }
}

function resolveDesensitizeDisplayStatus(assetStatus, mediaDesensitizeStatus) {
  if (assetStatus === ASSET_STATUS.MASKED_READY || assetStatus === ASSET_STATUS.MANUAL_MASKED) {
    return { key: 'ready', label: '已脱敏' }
  }
  if (mediaDesensitizeStatus === 'need_manual') {
    return { key: 'need_manual', label: '需人工' }
  }
  if (assetStatus === ASSET_STATUS.MASK_FAILED || mediaDesensitizeStatus === 'failed') {
    return { key: 'failed', label: '脱敏失败' }
  }
  if (assetStatus === ASSET_STATUS.MASKING) {
    return { key: 'processing', label: '处理中' }
  }
  return { key: 'pending', label: '待脱敏' }
}

function buildDesensitizeSummary(mediaAssets) {
  const summary = {
    total: mediaAssets.length,
    readyCount: 0,
    failedCount: 0,
    needManualCount: 0,
    pendingCount: 0,
    hasBlockingIssues: false,
  }
  mediaAssets.forEach((asset) => {
    const key = asset.desensitizeDisplay?.key || ''
    if (key === 'ready') summary.readyCount += 1
    else if (key === 'need_manual') summary.needManualCount += 1
    else if (key === 'failed') summary.failedCount += 1
    else summary.pendingCount += 1
  })
  summary.hasBlockingIssues = summary.failedCount + summary.needManualCount + summary.pendingCount > 0
  return summary
}

async function buildMediaAssetsForDetail(album, task) {
  const assetByKey = {}
  ;(task?.rawAssets || []).forEach((asset) => {
    const key = `${asset.nodeId}_${asset.idx != null ? asset.idx : asset.index}`
    assetByKey[key] = asset
  })

  const nodeTitleMap = {}
  ;(album.nodes || []).forEach((n) => {
    nodeTitleMap[n.nodeId] = n.title
  })

  const items = []
  for (const img of album.images || []) {
    const key = `${img.nodeId}_${img.idx}`
    const matched = assetByKey[key] || {}
    const maskedUrl =
      resolvePublicCaseMediaUrl(matched.maskedUrl || matched.preMaskedUrl || '') ||
      resolveDisplayMediaUrl(matched.maskedUrl || matched.preMaskedUrl || '')
    let privacyDetections = matched.privacyDetections || []
    if (!privacyDetections.length && matched.mediaId) {
      privacyDetections = await listPrivacyDetectionsByImageId(matched.mediaId, {
        caseId: '',
        includeResultJson: true,
      })
    }
    if (!matched.mediaId && img.rawUrl) {
      const media = await ensureMediaRecordFromUrl(img.rawUrl)
      if (media?.id) {
        privacyDetections = await listPrivacyDetectionsByImageId(media.id, {
          includeResultJson: true,
        })
      }
    }

    let mediaId = matched.mediaId || ''
    let mediaDesensitizeStatus = ''
    if (!mediaId && img.rawUrl) {
      const media = await ensureMediaRecordFromUrl(img.rawUrl)
      if (media?.id) {
        mediaId = media.id
        mediaDesensitizeStatus = media.desensitizeStatus || ''
      }
    } else if (mediaId) {
      const media = await getMediaById(mediaId)
      mediaDesensitizeStatus = media?.desensitizeStatus || ''
    }
    const assetStatus = matched.status || ''
    const desensitizeDisplay = resolveDesensitizeDisplayStatus(
      assetStatus,
      mediaDesensitizeStatus
    )

    items.push({
      imageId: img.id,
      assetId: matched.id || key,
      mediaId,
      nodeId: img.nodeId,
      nodeTitle: nodeTitleMap[img.nodeId] || img.nodeId,
      idx: img.idx,
      maskedUrl,
      riskLevel: matched.riskLevel || '',
      riskTags: matched.riskTags || [],
      privacyDetections,
      assetStatus,
      mediaDesensitizeStatus,
      desensitizeDisplay,
      canRetry: desensitizeDisplay.key === 'failed' || desensitizeDisplay.key === 'need_manual',
    })
  }

  return items
}

async function getAdminCaseDetail(caseId) {
  const row = await prisma.publicCase.findUnique({
    where: { id: caseId },
    include: {
      album: {
        include: {
          nodes: { orderBy: { sortOrder: 'asc' } },
          images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
          authorization: true,
        },
      },
    },
  })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }
  const album = row.album
  if (!album) {
    const err = new Error('关联相册不存在')
    err.status = 404
    throw err
  }

  const task = await loadPreMaskTask(album.id)
  const riskAgg = aggregateTaskRisk(task)
  const source = resolveCaseSource(album)
  const albumView = buildAlbumView(album)
  const publicPrice = buildPublicCasePrice(
    { ...albumView, authorizationTier: row.authorizationTier },
    { hasUserAuthorization: source === 'user_authorized' }
  )

  const reviewLogs = await fetchCaseReviewLogs(caseId)
  const mediaAssets = await buildMediaAssetsForDetail(album, task)
  const desensitizeSummary = buildDesensitizeSummary(mediaAssets)

  return {
    caseId: row.id,
    albumId: row.albumId,
    title: row.title,
    summary: row.summary,
    status: row.status,
    source,
    sourceLabel: sourceLabel(source),
    storeId: row.storeId,
    storeName: row.storeName,
    serviceName: row.serviceName,
    city: row.city,
    authorizationTier: row.authorizationTier,
    riskLevel: riskAgg.riskLevel,
    riskTags: riskAgg.riskTags,
    imageCount: album.imageCount || riskAgg.imageCount,
    price: {
      priceMode: row.priceMode || publicPrice.priceMode,
      minAmount: row.minAmount,
      maxAmount: row.maxAmount,
      planAmount: publicPrice.planAmount,
      label: formatPlanAmountLabel(publicPrice.planAmount),
    },
    authorization: album.authorization
      ? {
          agreed: album.authorization.agreed,
          status: album.authorization.status,
          tier: album.authorization.tier,
          updatedAt: toIso(album.authorization.updatedAt),
        }
      : null,
    vehicle: album.vehicleJson || {},
    contentJson: row.contentJson || {},
    preMaskTaskId: task?.taskId || buildPreMaskTaskId(album.id),
    preMaskStatus: task?.preMaskStatus || '',
    desensitizeSummary,
    mediaAssets,
    reviewLogs: reviewLogs.map((log) => ({
      id: log.id,
      reviewAction: log.reviewAction,
      reviewComment: log.reviewComment,
      beforeStatus: log.beforeStatus,
      afterStatus: log.afterStatus,
      riskLevel: log.riskLevel,
      reviewerId: log.reviewerId,
      createdAt: toIso(log.createdAt),
    })),
    submittedAt: toIso(row.updatedAt),
    publishedAt: row.publishedAt ? toIso(row.publishedAt) : '',
  }
}

async function fetchCaseReviewLogs(caseId) {
  if (!prisma.caseReviewLog) {
    console.warn(
      '[admin-case] prisma.caseReviewLog 不可用，请执行 npm run db:generate && npm run db:migrate'
    )
    return []
  }
  return prisma.caseReviewLog.findMany({
    where: { caseId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

async function appendReviewLog({
  caseId,
  reviewerId,
  reviewAction,
  reviewComment,
  beforeStatus,
  afterStatus,
  riskLevel = '',
}) {
  if (!prisma.caseReviewLog) {
    console.warn('[admin-case] 跳过审核留痕：case_review_log 表未就绪')
    return
  }
  await prisma.caseReviewLog.create({
    data: {
      id: newId('crl'),
      caseId,
      reviewerId: reviewerId || 'admin_system',
      reviewAction,
      reviewComment: reviewComment || '',
      beforeStatus,
      afterStatus,
      riskLevel,
    },
  })
}

async function assertCaseDesensitizeReady(caseId) {
  const detail = await getAdminCaseDetail(caseId)
  if (detail.desensitizeSummary?.hasBlockingIssues) {
    const { failedCount = 0, needManualCount = 0, pendingCount = 0 } = detail.desensitizeSummary
    const err = new Error(
      `仍有 ${failedCount + needManualCount + pendingCount} 张图片未完成脱敏，请先重试或退回商家处理`
    )
    err.status = 409
    err.code = 'DESENSITIZE_INCOMPLETE'
    throw err
  }
  return detail
}

async function approveAdminCase(caseId, { reviewerId, comment = '' } = {}) {
  const row = await prisma.publicCase.findUnique({ where: { id: caseId } })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }
  if (row.status !== PUBLIC_CASE_STATUS.PENDING_REVIEW) {
    const err = new Error('当前状态不可通过')
    err.status = 409
    throw err
  }

  await assertCaseDesensitizeReady(caseId)

  const album = await prisma.album.findUnique({
    where: { id: row.albumId },
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
      images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
      authorization: true,
      publicCase: true,
    },
  })
  const task = await resolvePublishTask(row.albumId, {})
  const hasOwner =
    Boolean(String(album.userId || '').trim()) ||
    Boolean(String(album.userPhone || '').trim())
  const hasUserAuth = album.authorization?.status === 'authorized'
  const coldStart = !hasUserAuth && !hasOwner
  const albumView = buildAlbumView(album)
  const draft = buildCaseDraft(albumView, task, row.authorizationTier, {
    coldStart,
    hasUserAuthorization: hasUserAuth,
    serviceItemId: album.serviceItemId || '',
    templateId: album.templateId || '',
  })
  const priceColumns = buildPublicCaseDbPriceColumns(draft)
  const articlePayload = buildCaseArticlePayload({
    caseId,
    draft,
    albumView,
    coldStart,
    hasUserAuthorization: hasUserAuth,
    serviceItemId: album.serviceItemId || '',
    templateId: album.templateId || '',
    previousArticleVersion: row.articleVersion || 0,
  })
  articlePayload.slug = await ensureUniqueCaseSlug(prisma, articlePayload.slug, caseId)
  articlePayload.canonicalPath = resolveCaseCanonicalPath({
    slug: articlePayload.slug,
    caseId,
  })
  stampPublishedH5OnPayload(articlePayload)
  const now = new Date()

  await prisma.publicCase.update({
    where: { id: caseId },
    data: {
      status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
      title: articlePayload.title,
      summary: articlePayload.summary,
      coverImage: draft.coverImage,
      contentJson: articlePayload.contentJson,
      minAmount: priceColumns.minAmount,
      maxAmount: priceColumns.maxAmount,
      priceMode: priceColumns.priceMode,
      publishedAt: now,
      seoTitle: articlePayload.seoTitle,
      seoDescription: articlePayload.seoDescription,
      aiSummary: articlePayload.aiSummary,
      articleBody: articlePayload.articleBody,
      articleStatus: articlePayload.articleStatus,
      articleVersion: articlePayload.articleVersion,
      articleGeneratedAt: articlePayload.articleGeneratedAt,
      seoNoindex: articlePayload.seoNoindex,
      slug: articlePayload.slug,
      canonicalPath: articlePayload.canonicalPath,
    },
  })

  await prisma.album.update({
    where: { id: row.albumId },
    data: {
      publicCaseStatus: 'public_approved',
      status: 'published',
    },
  })

  await appendReviewLog({
    caseId,
    reviewerId,
    reviewAction: 'approve',
    reviewComment: comment,
    beforeStatus: row.status,
    afterStatus: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
  })

  const { notifyCaseAuditResult } = require('./notification.service')
  notifyCaseAuditResult({ album, approved: true, comment }).catch((e) => {
    console.warn('[notification] case approve', e && e.message)
  })

  return getAdminCaseDetail(caseId)
}

async function rejectAdminCase(caseId, { reviewerId, comment = '', reasonType = '' } = {}) {
  const row = await prisma.publicCase.findUnique({ where: { id: caseId } })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }
  if (row.status !== PUBLIC_CASE_STATUS.PENDING_REVIEW) {
    const err = new Error('当前状态不可驳回')
    err.status = 409
    throw err
  }

  await prisma.publicCase.update({
    where: { id: caseId },
    data: { status: PUBLIC_CASE_STATUS.REJECTED },
  })
  await prisma.album.update({
    where: { id: row.albumId },
    data: { publicCaseStatus: 'private' },
  })

  await appendReviewLog({
    caseId,
    reviewerId,
    reviewAction: 'reject',
    reviewComment: [reasonType, comment].filter(Boolean).join('：'),
    beforeStatus: row.status,
    afterStatus: PUBLIC_CASE_STATUS.REJECTED,
  })

  const album = await prisma.album.findUnique({
    where: { id: row.albumId },
    include: { publicCase: true },
  })
  const { notifyCaseAuditResult } = require('./notification.service')
  notifyCaseAuditResult({
    album,
    approved: false,
    comment: [reasonType, comment].filter(Boolean).join('：'),
  }).catch((e) => {
    console.warn('[notification] case reject', e && e.message)
  })

  return getAdminCaseDetail(caseId)
}

async function requestModifyAdminCase(caseId, { reviewerId, comment = '', reasonType = '' } = {}) {
  const row = await prisma.publicCase.findUnique({ where: { id: caseId } })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }
  if (row.status !== PUBLIC_CASE_STATUS.PENDING_REVIEW) {
    const err = new Error('当前状态不可要求修改')
    err.status = 409
    throw err
  }

  await prisma.publicCase.update({
    where: { id: caseId },
    data: { status: PUBLIC_CASE_STATUS.NEED_MODIFY },
  })
  await prisma.album.update({
    where: { id: row.albumId },
    data: { publicCaseStatus: 'pending_review' },
  })

  await appendReviewLog({
    caseId,
    reviewerId,
    reviewAction: 'request_modify',
    reviewComment: [reasonType, comment].filter(Boolean).join('：'),
    beforeStatus: row.status,
    afterStatus: PUBLIC_CASE_STATUS.NEED_MODIFY,
  })

  return getAdminCaseDetail(caseId)
}

async function retryAdminCaseAsset(caseId, assetId, options = {}) {
  const row = await prisma.publicCase.findUnique({
    where: { id: caseId },
    select: { albumId: true },
  })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }
  const taskId = buildPreMaskTaskId(row.albumId)
  await retryAsset(taskId, assetId, {
    force: true,
    includeDetections: true,
    roles: ['system'],
  })
  if (options.skipDetail) return null
  return getAdminCaseDetail(caseId)
}

async function retryAllAdminCaseAssets(caseId) {
  const detail = await getAdminCaseDetail(caseId)
  const retryable = (detail.mediaAssets || []).filter((a) => a.canRetry)
  for (const asset of retryable) {
    await retryAdminCaseAsset(caseId, asset.assetId, { skipDetail: true })
  }
  return getAdminCaseDetail(caseId)
}

module.exports = {
  listAdminCases,
  getAdminCaseDetail,
  approveAdminCase,
  rejectAdminCase,
  requestModifyAdminCase,
  retryAdminCaseAsset,
  retryAllAdminCaseAssets,
  resolveCaseSource,
  sourceLabel,
}
