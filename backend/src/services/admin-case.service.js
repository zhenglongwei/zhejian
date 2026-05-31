const { prisma } = require('../lib/prisma')
const { newId, toIso } = require('../lib/ids')
const { PUBLIC_CASE_STATUS, RISK_LEVEL_ORDER } = require('../constants/v2')
const { resolveDisplayMediaUrl, resolvePublicCaseMediaUrl } = require('../lib/media-url')
const {
  buildPublicCasePrice,
  formatPlanAmountLabel,
  buildPublicCaseDbPriceColumns,
} = require('../utils/album-price')
const { getTaskById } = require('./desensitize.service')
const { buildPreMaskTaskId } = require('./desensitize.constants')
const { listPrivacyDetectionsByImageId } = require('./privacy-detection.service')
const { ensureMediaRecordFromUrl } = require('./media.service')
const { buildCaseDraft, resolvePublishTask } = require('./public-case.service')
const { buildAlbumView } = require('./service-album.service')

const RISK_RANK = RISK_LEVEL_ORDER

function resolveCaseSource(album) {
  if (!album.userId) return 'cold_start'
  if (album.authorization?.status === 'authorized') return 'user_authorized'
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
    const rawUrl = resolveDisplayMediaUrl(img.rawUrl)
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

    items.push({
      imageId: img.id,
      mediaId: matched.mediaId || '',
      nodeId: img.nodeId,
      nodeTitle: nodeTitleMap[img.nodeId] || img.nodeId,
      idx: img.idx,
      rawUrl,
      maskedUrl,
      riskLevel: matched.riskLevel || '',
      riskTags: matched.riskTags || [],
      privacyDetections,
      assetStatus: matched.status || '',
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

  const reviewLogs = await prisma.caseReviewLog.findMany({
    where: { caseId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

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
    mediaAssets: await buildMediaAssetsForDetail(album, task),
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

async function appendReviewLog({
  caseId,
  reviewerId,
  reviewAction,
  reviewComment,
  beforeStatus,
  afterStatus,
  riskLevel = '',
}) {
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

  const album = await prisma.album.findUnique({
    where: { id: row.albumId },
    include: {
      nodes: { orderBy: { sortOrder: 'asc' } },
      images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
      authorization: true,
    },
  })
  const task = await resolvePublishTask(row.albumId, {})
  const draft = buildCaseDraft(buildAlbumView(album), task, row.authorizationTier)
  const priceColumns = buildPublicCaseDbPriceColumns(draft)
  const now = new Date()

  await prisma.publicCase.update({
    where: { id: caseId },
    data: {
      status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
      title: draft.title,
      summary: draft.summary,
      coverImage: draft.coverImage,
      contentJson: draft.contentJson,
      minAmount: priceColumns.minAmount,
      maxAmount: priceColumns.maxAmount,
      priceMode: priceColumns.priceMode,
      publishedAt: now,
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

module.exports = {
  listAdminCases,
  getAdminCaseDetail,
  approveAdminCase,
  rejectAdminCase,
  requestModifyAdminCase,
  resolveCaseSource,
  sourceLabel,
}
